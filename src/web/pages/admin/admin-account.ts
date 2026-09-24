import type { AccountAction, Role } from '../../../shared/admin-functions';

export interface AdminAccount {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly isEmailConfirmed: boolean;
  readonly isDisabled: boolean;
}

export interface AdminAccountDetail {
  readonly account: AdminAccount;
  readonly actions: readonly AccountAction[];
}

export const roleLabel = (account: AdminAccount): string =>
  account.role === 'administrator' ? 'Administrator' : 'Traveler';

export const statusLabel = (account: AdminAccount): string => (account.isDisabled ? 'Disabled' : 'Enabled');
