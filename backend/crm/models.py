import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q


class Team(models.Model):
    name = models.CharField(max_length=120, unique=True)


class SecurityRateLimit(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)


class User(AbstractUser):
    class Role(models.TextChoices):
        SUPER = 'super_admin', 'Super Admin'
        ADMIN = 'admin', 'Admin'
        MANAGER = 'manager', 'Manager'
        SALES = 'sales', 'Sales Executive'
        SUPPORT = 'support', 'Support/User'
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SUPPORT)
    teams = models.ManyToManyField(Team, blank=True, related_name='members')
    created_by = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='created_users')

    @property
    def effective_role(self):
        return self.Role.SUPER if self.is_superuser else self.role


class Record(models.Model):
    class Kind(models.TextChoices):
        LEAD = 'lead', 'Lead'
        TICKET = 'ticket', 'Support ticket'
        CONTACT = 'contact', 'Contact'
        COMPANY = 'company', 'Company'
        DEAL = 'deal', 'Deal'
        TASK = 'task', 'Task'
        COMMUNICATION = 'communication', 'Communication'
        NOTE = 'note', 'Support note'
        DOCUMENT = 'document', 'Document metadata'
        PRODUCT = 'product', 'Product'
        INVOICE = 'invoice', 'Invoice'
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    name = models.CharField(max_length=160)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    company = models.CharField(max_length=160, blank=True)
    message = models.TextField(blank=True)
    source = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=40, default='New')
    details = models.JSONField(default=dict, blank=True)
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_records')
    assigned_to = models.ManyToManyField(User, blank=True, related_name='assigned_records')
    team = models.ForeignKey(Team, on_delete=models.SET_NULL, null=True, blank=True)
    support_access = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']


class AuditEvent(models.Model):
    actor = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=80)
    target = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)


def visible_records(user):
    role = user.effective_role
    records = Record.objects.all()
    if role in (User.Role.SUPER, User.Role.ADMIN):
        return records
    if role == User.Role.MANAGER:
        return records.filter(team__in=user.teams.all()).distinct()
    assigned = Q(assigned_to=user)
    if role == User.Role.SALES:
        return records.filter(Q(owner=user) | assigned).filter(kind__in=['lead', 'contact', 'company', 'deal', 'task', 'communication']).distinct()
    return records.filter(assigned, support_access=True, kind__in=['contact', 'task', 'communication', 'note', 'document', 'ticket']).distinct()
