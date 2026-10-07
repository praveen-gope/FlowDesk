import json
from functools import wraps
from pathlib import Path
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse, FileResponse, HttpResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt
from .models import User, Team, Record, AuditEvent, visible_records


def api(methods, roles=None, public=False):
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                return JsonResponse({'error': 'Method not allowed.'}, status=405)
            if not public and not request.user.is_authenticated:
                return JsonResponse({'error': 'Sign in required.'}, status=401)
            if roles and request.user.effective_role not in roles:
                return JsonResponse({'error': 'Permission denied.'}, status=403)
            try:
                return view(request, *args, **kwargs)
            except (ValueError, TypeError, ValidationError) as error:
                message = '; '.join(error.messages) if isinstance(error, ValidationError) else str(error)
                return JsonResponse({'error': message}, status=400)
        return wrapped
    return decorate


def payload(request):
    if len(request.body) > 16384:
        raise ValueError('Request is too large.')
    if request.content_type != 'application/json':
        raise ValueError('Send application/json.')
    data = json.loads(request.body)
    if not isinstance(data, dict):
        raise ValueError('Send a JSON object.')
    return data


def user_json(user):
    return {'id': user.id, 'name': user.get_full_name() or user.username, 'email': user.email,
            'role': user.effective_role, 'roleLabel': User.Role(user.effective_role).label,
            'teams': list(user.teams.values('id', 'name')), 'active': user.is_active}


def record_json(record):
    data = {key: getattr(record, key) for key in ['kind', 'name', 'email', 'phone', 'company', 'message', 'source', 'status', 'details', 'support_access']}
    data.update(id=str(record.id), owner=record.owner_id, team=record.team_id,
                assigned_to=list(record.assigned_to.values_list('id', flat=True)), createdAt=record.created_at.isoformat())
    return data


def throttle(request, key, maximum=20):
    key = f'{key}:{request.META.get("REMOTE_ADDR", "unknown")}'
    count = cache.get(key, 0)
    cache.set(key, count + 1, 60)
    return count >= maximum


@api(['GET'], public=True)
def session(request):
    return JsonResponse({'user': user_json(request.user) if request.user.is_authenticated else None, 'csrfToken': get_token(request)})


@api(['POST'], public=True)
def sign_in(request):
    if throttle(request, 'login', 10):
        return JsonResponse({'error': 'Too many attempts. Wait a minute.'}, status=429)
    data = payload(request)
    email = data.get('email', '')
    if not isinstance(email, str) or not isinstance(data.get('password'), str):
        raise ValueError('Email and password are required.')
    found = User.objects.filter(email__iexact=email.strip()).first()
    user = authenticate(request, username=found.username if found else '', password=data['password'])
    if not user:
        return JsonResponse({'error': 'Invalid email or password.'}, status=401)
    login(request, user)
    return JsonResponse({'user': user_json(user), 'csrfToken': get_token(request)})


@api(['POST'])
def sign_out(request):
    logout(request)
    return JsonResponse({'ok': True})


def clean_fields(data, capture=False):
    result = {}
    for key, limit in {'name': 160, 'email': 254, 'phone': 40, 'company': 160, 'message': 4000, 'source': 200, 'status': 40}.items():
        if key not in data:
            continue
        value = data[key]
        if not isinstance(value, str) or len(value.strip()) > limit:
            raise ValueError(f'Invalid {key}. Maximum length: {limit}.')
        result[key] = value.strip()
    if 'name' in result and not result['name']:
        raise ValueError('Name is required.')
    if result.get('email'):
        validate_email(result['email'])
    if capture and (not result.get('name') or not result.get('email')):
        raise ValueError('Name and valid email are required.')
    return result


@csrf_exempt
@api(['POST'], public=True)
def capture(request):
    if throttle(request, 'capture'):
        return JsonResponse({'error': 'Too many submissions. Wait a minute.'}, status=429)
    data = payload(request)
    if data.get('website'):
        raise ValueError('Submission rejected.')
    fields = clean_fields(data, capture=True)
    fields.pop('status', None)
    fields.setdefault('source', request.headers.get('Origin', 'Website form'))
    record = Record.objects.create(kind='lead', **fields)
    AuditEvent.objects.create(action='lead.captured', target=str(record.id))
    return JsonResponse({'id': str(record.id), 'message': 'Lead captured successfully.'}, status=201)


def editable(user, kind):
    role = user.effective_role
    if role in ['super_admin', 'admin']:
        return True
    if role == 'manager':
        return kind not in ['product', 'invoice']
    if role == 'sales':
        return kind in ['lead', 'contact', 'company', 'deal', 'task', 'communication']
    return kind in ['note', 'task', 'document', 'ticket']


def assignment(user, data, record):
    role = user.effective_role
    if role not in ['super_admin', 'admin', 'manager']:
        if any(key in data for key in ['owner', 'team', 'assigned_to', 'support_access']):
            raise PermissionError('Only administrators and managers can assign records.')
        return
    if 'support_access' in data:
        if not isinstance(data['support_access'], bool):
            raise ValueError('support_access must be true or false.')
        record.support_access = data['support_access']
    if 'team' in data:
        team = Team.objects.filter(pk=data['team']).first() if data['team'] else None
        if data['team'] and not team:
            raise ValueError('Unknown team.')
        if role == 'manager' and (not team or not user.teams.filter(pk=team.pk).exists()):
            raise PermissionError('Managers can assign only their own teams.')
        record.team = team
    if 'owner' in data:
        owner = User.objects.filter(pk=data['owner'], is_active=True).first() if data['owner'] else None
        if data['owner'] and not owner:
            raise ValueError('Unknown owner.')
        if role == 'manager' and owner and (not record.team_id or not owner.teams.filter(pk=record.team_id).exists()):
            raise PermissionError('Owner must belong to the assigned team.')
        record.owner = owner
    if 'assigned_to' in data:
        ids = data['assigned_to']
        if not isinstance(ids, list) or any(not isinstance(i, int) or isinstance(i, bool) for i in ids):
            raise ValueError('assigned_to must be a list of user IDs.')
        users = User.objects.filter(pk__in=ids, is_active=True)
        if users.count() != len(set(ids)):
            raise ValueError('Unknown assignee.')
        if role == 'manager' and any(not record.team_id or not u.teams.filter(pk=record.team_id).exists() for u in users):
            raise PermissionError('Assignees must belong to the assigned team.')


@api(['GET', 'POST'])
def records(request, kind):
    if kind not in Record.Kind.values:
        return JsonResponse({'error': 'Unknown module.'}, status=404)
    if request.method == 'GET':
        rows = visible_records(request.user).filter(kind=kind).prefetch_related('assigned_to')
        return JsonResponse({'records': [record_json(r) for r in rows]})
    if not editable(request.user, kind):
        return JsonResponse({'error': 'Permission denied.'}, status=403)
    data = payload(request)
    fields = clean_fields(data)
    if not fields.get('name'):
        raise ValueError('Name is required.')
    with transaction.atomic():
        record = Record(kind=kind, owner=request.user, **fields)
        if request.user.effective_role == 'manager':
            record.team = request.user.teams.first()
            if not record.team:
                return JsonResponse({'error': 'A team assignment is required.'}, status=403)
        if request.user.effective_role == 'support':
            record.support_access = True
        try:
            assignment(request.user, data, record)
        except PermissionError as error:
            return JsonResponse({'error': str(error)}, status=403)
        if 'details' in data:
            if not isinstance(data['details'], dict):
                raise ValueError('details must be an object.')
            record.details = data['details']
        record.save()
        record.assigned_to.set(data.get('assigned_to', [request.user.id]))
        AuditEvent.objects.create(actor=request.user, action='record.created', target=str(record.pk))
    return JsonResponse({'record': record_json(record)}, status=201)


@api(['GET', 'PATCH', 'DELETE'])
def record_detail(request, record_id):
    record = visible_records(request.user).filter(pk=record_id).first()
    if not record:
        return JsonResponse({'error': 'Record not found.'}, status=404)
    if request.method == 'GET':
        return JsonResponse({'record': record_json(record)})
    if request.method == 'DELETE':
        if request.user.effective_role not in ['super_admin', 'admin']:
            return JsonResponse({'error': 'Only administrators can delete records.'}, status=403)
        AuditEvent.objects.create(actor=request.user, action='record.deleted', target=str(record.pk))
        record.delete()
        return JsonResponse({'ok': True})
    if not editable(request.user, record.kind):
        return JsonResponse({'error': 'This record is read-only for your role.'}, status=403)
    data = payload(request)
    with transaction.atomic():
        try:
            assignment(request.user, data, record)
        except PermissionError as error:
            return JsonResponse({'error': str(error)}, status=403)
        for key, value in clean_fields(data).items():
            setattr(record, key, value)
        if 'details' in data:
            if not isinstance(data['details'], dict):
                raise ValueError('details must be an object.')
            record.details = data['details']
        record.save()
        if 'assigned_to' in data:
            record.assigned_to.set(data['assigned_to'])
        AuditEvent.objects.create(actor=request.user, action='record.updated', target=str(record.pk))
    return JsonResponse({'record': record_json(record)})


@api(['GET'])
def leads(request):
    return JsonResponse({'leads': [record_json(r) for r in visible_records(request.user).filter(kind='lead').prefetch_related('assigned_to')]})


@api(['GET'])
def reports(request):
    rows = visible_records(request.user)
    return JsonResponse({'counts': {kind: rows.filter(kind=kind).count() for kind in Record.Kind.values}})


CREATABLE_ROLES = {
    'super_admin': ['super_admin', 'admin', 'manager', 'sales', 'support'],
    'admin': ['manager', 'sales', 'support'],
    'manager': ['manager', 'sales', 'support'],
    'sales': ['support'],
    'support': ['support'],
}


def manageable_users(actor):
    role = actor.effective_role
    if role == 'super_admin':
        return User.objects.all()
    rows = User.objects.filter(role__in=CREATABLE_ROLES[role], is_superuser=False)
    if role == 'admin':
        return rows
    if role == 'manager':
        # A manager may manage their own invites and lower-role team members.
        # Every target team must be inside the manager's scope.
        return rows.filter(Q(created_by=actor) | Q(role__in=['sales', 'support'], teams__in=actor.teams.all())).exclude(teams__in=Team.objects.exclude(pk__in=actor.teams.values('pk'))).distinct()
    return rows.filter(created_by=actor)


def validate_user_teams(actor, ids):
    if not isinstance(ids, list) or any(not isinstance(i, int) or isinstance(i, bool) for i in ids):
        raise ValueError('teams must contain integer team IDs.')
    if Team.objects.filter(pk__in=ids).count() != len(set(ids)):
        raise ValueError('Unknown team.')
    if actor.effective_role not in ['super_admin', 'admin']:
        if set(ids) - set(actor.teams.values_list('pk', flat=True)):
            raise PermissionError('You can invite users only within your assigned teams.')


@api(['GET', 'POST'])
def users(request):
    if request.method == 'GET':
        rows = manageable_users(request.user)
        allowed = CREATABLE_ROLES[request.user.effective_role]
        return JsonResponse({'users': [user_json(u) for u in rows], 'roles': [{'value': value, 'label': label} for value, label in User.Role.choices if value in allowed]})
    data = payload(request)
    role = data.get('role', 'support')
    if role not in User.Role.values:
        raise ValueError('Unknown role.')
    if role not in CREATABLE_ROLES[request.user.effective_role]:
        return JsonResponse({'error': 'Your role cannot create this account type.'}, status=403)
    email = data.get('email', '')
    if not isinstance(email, str) or len(email) > 254:
        raise ValueError('Invalid email.')
    email = email.strip().lower()
    validate_email(email)
    if User.objects.filter(email__iexact=email).exists():
        raise ValueError('Email is already registered.')
    password = data.get('password', '')
    if not isinstance(password, str):
        raise ValueError('Password must be text.')
    name = data.get('name', '')
    if not isinstance(name, str) or len(name) > 150:
        raise ValueError('Invalid name.')
    candidate = User(username=email, email=email, first_name=name, role=role, created_by=request.user)
    validate_password(password, candidate)
    team_ids = data.get('teams', list(request.user.teams.values_list('pk', flat=True)) if request.user.effective_role not in ['super_admin', 'admin'] else [])
    try:
        validate_user_teams(request.user, team_ids)
    except PermissionError as error:
        return JsonResponse({'error': str(error)}, status=403)
    with transaction.atomic():
        candidate.set_password(password)
        candidate.save()
        candidate.teams.set(team_ids)
        AuditEvent.objects.create(actor=request.user, action='user.created', target=str(candidate.pk))
    return JsonResponse({'user': user_json(candidate)}, status=201)


@api(['PATCH'])
def user_detail(request, user_id):
    target = User.objects.filter(pk=user_id).first()
    if not target:
        return JsonResponse({'error': 'User not found.'}, status=404)
    if target.pk == request.user.pk:
        return JsonResponse({'error': 'You cannot change your own access.'}, status=403)
    if not manageable_users(request.user).filter(pk=target.pk).exists():
        return JsonResponse({'error': 'This account is outside your user-management scope.'}, status=403)
    data = payload(request)
    role = data.get('role', target.role)
    if role not in User.Role.values:
        raise ValueError('Unknown role.')
    if role not in CREATABLE_ROLES[request.user.effective_role]:
        return JsonResponse({'error': 'Role escalation is not allowed.'}, status=403)
    if 'active' in data and not isinstance(data['active'], bool):
        raise ValueError('active must be true or false.')
    teams = data.get('teams')
    if teams is not None:
        try:
            validate_user_teams(request.user, teams)
        except PermissionError as error:
            return JsonResponse({'error': str(error)}, status=403)
    with transaction.atomic():
        target.role = role
        target.is_active = data.get('active', target.is_active)
        target.save()
        if teams is not None:
            target.teams.set(teams)
        AuditEvent.objects.create(actor=request.user, action='user.updated', target=str(target.pk))
    return JsonResponse({'user': user_json(target)})


@api(['GET', 'POST'])
def teams(request):
    if request.method == 'GET':
        rows = Team.objects.all() if request.user.effective_role in ['super_admin', 'admin'] else request.user.teams.all()
        return JsonResponse({'teams': list(rows.values('id', 'name'))})
    if request.user.effective_role not in ['super_admin', 'admin']:
        return JsonResponse({'error': 'Permission denied.'}, status=403)
    name = payload(request).get('name', '')
    if not isinstance(name, str) or not name.strip() or len(name) > 120:
        raise ValueError('A team name is required (maximum 120 characters).')
    team, _ = Team.objects.get_or_create(name=name.strip())
    return JsonResponse({'team': {'id': team.id, 'name': team.name}}, status=201)


@api(['GET'], roles=['super_admin'])
def system(request):
    return JsonResponse({'roles': dict(User.Role.choices), 'leadFormOrigins': settings.LEAD_FORM_ORIGINS,
                         'audit': list(AuditEvent.objects.order_by('-created_at').values('action', 'target', 'created_at')[:100])})


@api(['GET'], roles=['super_admin', 'admin', 'manager'])
def assignees(request):
    rows = User.objects.filter(is_active=True)
    if request.user.effective_role == 'manager':
        rows = rows.filter(teams__in=request.user.teams.all()).distinct()
    return JsonResponse({'users': [user_json(u) for u in rows]})


@csrf_exempt
@api(['POST'], public=True)
def support_capture(request):
    if throttle(request, 'support_capture'):
        return JsonResponse({'error': 'Too many submissions. Wait a minute.'}, status=429)
    data = payload(request)
    if data.get('website'):
        raise ValueError('Submission rejected.')
    fields = clean_fields(data, capture=True)
    subject = data.get('subject', '')
    if not isinstance(subject, str) or not subject.strip() or len(subject.strip()) > 160:
        raise ValueError('A subject is required (maximum 160 characters).')
    if not fields.get('message'):
        raise ValueError('Describe your support request.')
    priority = data.get('priority', 'Normal')
    category = data.get('category', 'Support')
    if priority not in ['Low', 'Normal', 'High', 'Urgent']:
        raise ValueError('Invalid priority.')
    if category not in ['Support', 'Technical issue', 'Billing', 'General enquiry']:
        raise ValueError('Invalid category.')
    requester = fields.pop('name')
    fields.pop('status', None)
    fields.setdefault('source', request.headers.get('Origin', 'Support website'))
    with transaction.atomic():
        ticket = Record.objects.create(kind='ticket', name=subject.strip(), status='Open', support_access=True,
            details={'Requester': requester, 'Priority': priority, 'Category': category}, **fields)
        AuditEvent.objects.create(action='support.captured', target=str(ticket.id))
    return JsonResponse({'id': str(ticket.id), 'reference': 'FD-' + ticket.id.hex.upper(),
                         'message': 'Your support request has been received.'}, status=201)


def frontend(request, asset='index.html'):
    if request.method not in ['GET', 'HEAD']:
        return HttpResponse(status=405)
    relative = Path(asset)
    if relative.suffix not in ['.html', '.css', '.js'] or '..' in relative.parts or relative.parts[0] in ['backend', 'server']:
        return HttpResponse(status=404)
    file = (settings.FRONTEND_DIR / relative).resolve()
    if not file.is_relative_to(settings.FRONTEND_DIR.resolve()) or not file.is_file():
        return HttpResponse(status=404)
    public = ['index.html', 'html/sign-in.html', 'html/lead-form.html', 'html/support-form.html', 'html/forgot-password.html']
    if relative.suffix == '.html' and asset not in public and not request.user.is_authenticated:
        from django.shortcuts import redirect
        return redirect('/html/sign-in.html')
    return FileResponse(file.open('rb'))
