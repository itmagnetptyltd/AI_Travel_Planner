import type { EmailMessage } from './email-service';

export function confirmationEmail(to: string, appBaseUrl: string, token: string): EmailMessage {
  const link = new URL('/confirm-email', appBaseUrl);
  link.searchParams.set('token', token);
  return {
    to,
    subject: 'Confirm your email address',
    text: [
      'Welcome to AI Travel Planner.',
      '',
      'Confirm your email address to start creating Trips:',
      link.toString(),
      '',
      'This link expires in 24 hours.',
    ].join('\n'),
  };
}

export function passwordResetEmail(to: string, appBaseUrl: string, token: string): EmailMessage {
  const link = new URL('/reset-password', appBaseUrl);
  link.searchParams.set('token', token);
  return {
    to,
    subject: 'Reset your password',
    text: [
      'Someone asked to reset the password for this AI Travel Planner account.',
      '',
      'To choose a new password, open:',
      link.toString(),
      '',
      'This link expires in 1 hour and works once. If you did not ask for this, ignore this email.',
    ].join('\n'),
  };
}
