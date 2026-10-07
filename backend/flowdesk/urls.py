from django.urls import path
from crm import views

urlpatterns = [
    path('api/auth/session', views.session),
    path('api/auth/login', views.sign_in),
    path('api/auth/logout', views.sign_out),
    path('api/capture', views.capture),
    path('api/support/capture', views.support_capture),
    path('api/leads', views.leads),
    path('api/records/<str:kind>', views.records),
    path('api/record/<uuid:record_id>', views.record_detail),
    path('api/reports', views.reports),
    path('api/users', views.users),
    path('api/users/<int:user_id>', views.user_detail),
    path('api/teams', views.teams),
    path('api/assignees', views.assignees),
    path('api/system', views.system),
    path('', views.frontend),
    path('<path:asset>', views.frontend),
]
