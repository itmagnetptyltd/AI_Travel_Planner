import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationEvent, type NotificationSettings } from '../../../shared/notification-schemas';
import { api } from '../../api-client';
import { NotificationSwitches } from '../../components/NotificationSwitches';

type Message = { readonly text: string; readonly isError: boolean } | null;

/**
 * Which emails are sent at all (REQ-TRV-060). An email switched off here is off for everyone, whatever a Traveler chose
 * for their own account. Account emails and shared Plans are not listed: they cannot be switched off.
 */
export function AdminNotificationsPage() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [message, setMessage] = useState<Message>(null);
  // Nothing can be changed, or saved, until the settings have been read: a form of defaults would switch every email back on.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void api<NotificationSettings>('GET', '/api/admin/notification-settings').then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        setSettings(result.data);
        setIsLoaded(true);
      } else setMessage({ text: result.error.message ?? 'The settings could not be loaded.', isError: true });
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  const change = (event: NotificationEvent, isOn: boolean) => {
    setSettings((current) => ({ ...current, [event]: isOn }));
    setMessage(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<NotificationSettings>('PUT', '/api/admin/notification-settings', settings);
    if (result.ok) setSettings(result.data);
    setMessage(
      result.ok
        ? { text: 'Notification settings saved.', isError: false }
        : { text: result.error.message ?? 'The settings could not be saved.', isError: true },
    );
  };

  return (
    <>
      <h1>Notification settings</h1>
      {isLoaded ? (
        <form onSubmit={(event) => void save(event)}>
          <NotificationSwitches legend="Emails sent to Travelers" settings={settings} onChange={change} />
          <p className="hint">A switch that is off here is off for every Traveler. Confirmation and password reset emails are always sent.</p>
          <button type="submit">Save settings</button>
        </form>
      ) : null}
      {message ? <p role={message.isError ? 'alert' : 'status'}>{message.text}</p> : null}
    </>
  );
}
