import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AccountAction, Role } from '../../../shared/admin-functions';
import { api } from '../../api-client';
import { roleLabel, statusLabel, type AdminAccountDetail } from './admin-account';

type Message = { readonly text: string; readonly isError: boolean } | null;

const BUTTON_LABELS: Readonly<Record<Exclude<AccountAction, 'view'>, string>> = {
  disable: 'Disable',
  enable: 'Re-enable',
  'change-role': 'Change role',
};

/** Viewing one account. Its actions are exactly those the API offers (REQ-TRV-071). */
export function AdminUserPage() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<AdminAccountDetail | null>(null);
  const [isConfirmingRole, setIsConfirmingRole] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const load = useCallback(async () => {
    const result = await api<AdminAccountDetail>('GET', `/api/admin/accounts/${encodeURIComponent(id)}`);
    if (result.ok) setDetail(result.data);
    else setMessage({ text: result.error.message ?? 'This account could not be loaded.', isError: true });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!detail) {
    return message ? <p role="alert">{message.text}</p> : <p>Loading…</p>;
  }
  const { account, actions } = detail;
  const newRole: Role = account.role === 'administrator' ? 'traveler' : 'administrator';

  const setDisabled = async (isDisabled: boolean) => {
    const result = await api('POST', `/api/admin/accounts/${encodeURIComponent(id)}/${isDisabled ? 'disable' : 'enable'}`);
    setMessage(result.ok ? null : { text: result.error.message ?? 'The account could not be changed.', isError: true });
    await load();
  };

  const changeRole = async () => {
    setIsConfirmingRole(false);
    const result = await api('PUT', `/api/admin/accounts/${encodeURIComponent(id)}/role`, { role: newRole, confirm: true });
    setMessage(
      result.ok
        ? { text: 'Role changed.', isError: false }
        : { text: result.error.message ?? 'The role could not be changed.', isError: true },
    );
    await load();
  };

  const run = (action: Exclude<AccountAction, 'view'>) => {
    setMessage(null);
    if (action === 'change-role') setIsConfirmingRole(true);
    else void setDisabled(action === 'disable');
  };

  return (
    <>
      <h1>{account.email}</h1>
      <p>Role: {roleLabel(account)}</p>
      <p>Status: {statusLabel(account)}</p>
      <div role="group" aria-label="Account actions">
        {actions
          .filter((action): action is Exclude<AccountAction, 'view'> => action !== 'view')
          .map((action) => (
            <button key={action} type="button" onClick={() => run(action)}>
              {BUTTON_LABELS[action]}
            </button>
          ))}
      </div>
      {isConfirmingRole ? (
        <div role="dialog" aria-label="Confirm role change">
          <p>
            {newRole === 'administrator'
              ? `Make ${account.email} an Administrator?`
              : `Remove the Administrator role from ${account.email}?`}
          </p>
          <button type="button" onClick={() => void changeRole()}>
            Confirm
          </button>
          <button type="button" onClick={() => setIsConfirmingRole(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      {message ? <p role={message.isError ? 'alert' : 'status'}>{message.text}</p> : null}
    </>
  );
}
