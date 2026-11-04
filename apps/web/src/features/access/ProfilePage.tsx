import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  ApiClientError,
  apiRequest,
  setAccessTokenInMemory,
} from '../../shared/api/http-client.ts';
import { ROLE_LABELS, useAuth } from '../../shared/auth/auth-context.tsx';
import { Badge, Button, Card, Input } from '../../shared/ui/index.ts';

export function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!user) return null;

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 12) {
      setErrorMessage('La nueva contraseña debe tener al menos 12 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<null>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setAccessTokenInMemory(null);
      setSuccessMessage('Contraseña actualizada. Inicia sesión nuevamente con tu nueva clave.');
      setCurrentPassword('');
      setNewPassword('');
      await logout();
      void navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible actualizar la contraseña.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
          Seguridad de la cuenta
        </p>
        <h1 className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight">
          Mi perfil y contraseña
        </h1>
        <p className="mt-1 text-sm text-[var(--text-body)]">
          Al cambiar tu contraseña se revocan automáticamente las sesiones activas en otros
          dispositivos.
        </p>
      </div>

      <Card
        title="Información del funcionario"
        description="Datos asociados a tu cuenta de trabajo."
      >
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Nombre completo</dt>
            <dd className="mt-0.5 font-medium text-[var(--text-heading)]">{user.fullName}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Correo electrónico</dt>
            <dd className="mt-0.5 font-mono text-[var(--text-heading)]">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Rol asignado</dt>
            <dd className="mt-1">
              <Badge status="info">{ROLE_LABELS[user.role]}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Identificador de cuenta</dt>
            <dd className="mt-0.5 font-mono text-xs text-[var(--text-body)]">{user.id}</dd>
          </div>
        </dl>
      </Card>

      <Card
        title="Cambiar contraseña"
        description="Usa al menos 12 caracteres. Evita contraseñas comunes o incluir tu correo electrónico."
      >
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-sm text-[var(--status-danger-text)]"
          >
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div
            role="status"
            className="mb-4 rounded-[var(--radius-control)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3.5 py-2.5 text-sm text-[var(--status-success-text)]"
          >
            {successMessage}
          </div>
        )}

        <form onSubmit={(e) => void handlePasswordChange(e)} className="space-y-4">
          <Input
            label="Contraseña actual"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />

          <Input
            label="Nueva contraseña (mínimo 12 caracteres)"
            type="password"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          {/* Única acción cromática principal de la vista */}
          <div className="pt-2">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Actualizando…' : 'Actualizar contraseña'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
