import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Role } from '../../../shared/admin-functions';
import { api } from '../../api-client';
import { roleLabel, statusLabel, type AdminAccount } from './admin-account';

type UsersState =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly accounts: readonly AdminAccount[] }
  | { readonly state: 'failed'; readonly message: string };

export function AdminUsersPage() {
  const [users, setUsers] = useState<UsersState>({ state: 'loading' });
  const [roles, setRoles] = useState<readonly { readonly role: Role; readonly label: string }[]>([]);

  useEffect(() => {
    let isCurrent = true;
    void api<{ roles: { role: Role; label: string }[] }>('GET', '/api/admin/roles').then((result) => {
      if (isCurrent && result.ok) setRoles(result.data.roles);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void api<{ accounts: AdminAccount[] }>('GET', '/api/admin/accounts').then((result) => {
      if (!isCurrent) return;
      setUsers(
        result.ok
          ? { state: 'loaded', accounts: result.data.accounts }
          : { state: 'failed', message: result.error.message ?? 'Users could not be loaded.' },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <>
      <h1>Users</h1>
      {roles.length > 0 ? <p>{`Roles an account can hold: ${roles.map((role) => role.label).join(', ')}.`}</p> : null}
      <p>
        <Link to="/admin/trips">All Travelers’ Trips</Link>
      </p>
      {users.state === 'loading' ? <p>Loading…</p> : null}
      {users.state === 'failed' ? <p role="alert">{users.message}</p> : null}
      {users.state === 'loaded' ? (
        <table>
          <thead>
            <tr>
              <th scope="col">Email address</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.email}</td>
                <td>{roleLabel(account)}</td>
                <td>{statusLabel(account)}</td>
                <td>
                  <Link to={`/admin/users/${account.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
