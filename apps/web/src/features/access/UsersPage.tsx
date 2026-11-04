import type { ManageableStaffRole, UserProfile } from '@tap/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { ROLE_LABELS, useAuth } from '../../shared/auth/auth-context.tsx';
import { Badge, Button, Card, Input, Table, type TableColumn } from '../../shared/ui/index.ts';

export function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ManageableStaffRole>('operator');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await apiRequest<UserProfile[]>('/users');
        if (active) setUsers(list);
      } catch (err) {
        if (active && err instanceof ApiClientError) {
          setErrorMessage(err.detail);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setCreating(true);
    try {
      const created = await apiRequest<UserProfile>('/users', {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role,
        },
      });
      setUsers((prev) => [...prev, created]);
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('operator');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible registrar el funcionario.');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggleUserStatus = async (target: UserProfile) => {
    setErrorMessage(null);
    try {
      const updated =
        target.status === 'active'
          ? await apiRequest<UserProfile>(`/users/${target.id}/disable`, {
              method: 'POST',
            })
          : await apiRequest<UserProfile>(`/users/${target.id}`, {
              method: 'PATCH',
              body: { status: 'active' },
            });
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      }
    }
  };

  const columns: TableColumn<UserProfile>[] = [
    {
      key: 'fullName',
      header: 'Funcionario',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--text-heading)]">{row.fullName}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      render: (row) => <Badge status="info">{ROLE_LABELS[row.role]}</Badge>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => (
        <Badge status={row.status === 'active' ? 'success' : 'danger'}>
          {row.status === 'active' ? 'Activo' : 'Deshabilitado'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      render: (row) =>
        row.id === user?.id ? (
          <span className="text-xs text-[var(--text-muted)]">Tu cuenta actual</span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleToggleUserStatus(row)}
          >
            {row.status === 'active' ? 'Deshabilitar' : 'Reactivar'}
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
          Control de acceso
        </p>
        <h1 className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight">
          Usuarios y roles de la entidad
        </h1>
        <p className="mt-1 text-sm text-[var(--text-body)]">
          Deshabilitar una cuenta invalida sus sesiones y tokens de refresco de forma inmediata.
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-sm text-[var(--status-danger-text)]"
        >
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <Card
            title="Personal registrado"
            description={
              loading ? 'Cargando funcionarios…' : `${users.length} cuentas en tu entidad.`
            }
          >
            <div className="mt-2">
              <Table
                columns={columns}
                rows={users}
                getRowKey={(row) => row.id}
                emptyMessage="Aún no hay otros funcionarios registrados."
              />
            </div>
          </Card>
        </div>

        <Card
          title="Nuevo funcionario"
          description="Asigna el permiso mínimo necesario según sus funciones operativas."
        >
          <form onSubmit={(e) => void handleCreateUser(e)} className="mt-2 space-y-4">
            <Input
              label="Nombre completo"
              name="fullName"
              placeholder="Ej. Laura Gómez"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <Input
              label="Correo institucional"
              type="email"
              name="email"
              placeholder="laura@entidad.edu.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div>
              <label
                htmlFor="user-role-select"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
              >
                Rol en la entidad
              </label>
              <select
                id="user-role-select"
                value={role}
                onChange={(e) => setRole(e.target.value as ManageableStaffRole)}
                className="w-full h-10 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-heading)]"
              >
                <option value="operator">Operador de punto (asistencia y préstamos)</option>
                <option value="viewer">Consulta (solo lectura y reportes)</option>
                <option value="org_admin">Administrador de entidad</option>
              </select>
            </div>

            <Input
              label="Contraseña inicial (mín. 12 caracteres)"
              type="password"
              name="password"
              placeholder="Contraseña inicial robusta"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {/* Única acción cromática principal de la vista */}
            <Button type="submit" variant="primary" className="w-full" disabled={creating}>
              {creating ? 'Creando cuenta…' : 'Registrar funcionario'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
