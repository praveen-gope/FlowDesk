from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone
from crm.models import SecurityRateLimit


class Command(BaseCommand):
    help = 'Remove expired rate-limit entries and Django sessions.'

    def handle(self, *args, **options):
        count, _ = SecurityRateLimit.objects.filter(expires_at__lt=timezone.now()).delete()
        call_command('clearsessions')
        self.stdout.write(f'Removed {count} expired rate-limit entries.')
