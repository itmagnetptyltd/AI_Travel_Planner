import { NOTIFICATION_EVENTS, NOTIFICATION_LABELS, type NotificationEvent, type NotificationSettings } from '../../shared/notification-schemas';

/**
 * One switch for each email that can be switched off, and no others: the emails that cannot be switched off (account
 * confirmation, password reset, a Plan the Traveler chooses to share) are not offered here, so there is nothing to click.
 */
export function NotificationSwitches({ legend, settings, onChange }: {
  readonly legend: string;
  readonly settings: NotificationSettings;
  readonly onChange: (event: NotificationEvent, isOn: boolean) => void;
}) {
  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      {NOTIFICATION_EVENTS.map((event) => (
        <label key={event} className="choice">
          <input type="checkbox" checked={settings[event]} onChange={(input) => onChange(event, input.target.checked)} />
          {NOTIFICATION_LABELS[event]}
        </label>
      ))}
    </fieldset>
  );
}
