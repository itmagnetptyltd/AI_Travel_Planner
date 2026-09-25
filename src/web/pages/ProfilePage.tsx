import { useEffect, useState, type FormEvent } from 'react';
import { CURRENCIES } from '../../shared/currencies';
import { FOOD_PREFERENCES } from '../../shared/food-preferences';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationEvent, type NotificationSettings } from '../../shared/notification-schemas';
import { TRAVEL_STYLES } from '../../shared/travel-styles';
import { api } from '../api-client';
import { FormField } from '../components/FormField';
import { NotificationSwitches } from '../components/NotificationSwitches';
import { SelectField } from '../components/SelectField';

interface ProfileForm {
  readonly displayName: string;
  readonly preferredCurrency: string;
  readonly defaultTravelStyle: string;
  readonly foodPreference: string;
  readonly notifications: NotificationSettings;
}

type ProfileResponse = { readonly [K in Exclude<keyof ProfileForm, 'notifications'>]: string | null } & { readonly notifications: NotificationSettings };

const EMPTY_FORM: ProfileForm = {
  displayName: '',
  preferredCurrency: '',
  defaultTravelStyle: '',
  foodPreference: '',
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
};

const toForm = (profile: ProfileResponse): ProfileForm => ({
  displayName: profile.displayName ?? '',
  preferredCurrency: profile.preferredCurrency ?? '',
  defaultTravelStyle: profile.defaultTravelStyle ?? '',
  foodPreference: profile.foodPreference ?? '',
  notifications: profile.notifications,
});

/** An empty field is saved as "not set". */
const toUpdate = (form: ProfileForm): ProfileResponse => ({
  displayName: form.displayName.trim() || null,
  preferredCurrency: form.preferredCurrency || null,
  defaultTravelStyle: form.defaultTravelStyle || null,
  foodPreference: form.foodPreference || null,
  notifications: form.notifications,
});

export function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [message, setMessage] = useState<{ readonly text: string; readonly isError: boolean } | null>(null);
  // Nothing can be changed, or saved, until the profile has been read: a form of defaults would overwrite the real one.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void api<ProfileResponse>('GET', '/api/profile').then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        setForm(toForm(result.data));
        setIsLoaded(true);
      } else setMessage({ text: result.error.message ?? 'Your profile could not be loaded.', isError: true });
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  const change = (field: Exclude<keyof ProfileForm, 'notifications'>) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const switchNotification = (event: NotificationEvent, isOn: boolean) => {
    setForm((current) => ({ ...current, notifications: { ...current.notifications, [event]: isOn } }));
    setMessage(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<ProfileResponse>('PATCH', '/api/profile', toUpdate(form));
    setMessage(
      result.ok
        ? { text: 'Profile saved.', isError: false }
        : { text: result.error.message ?? 'Your profile could not be saved.', isError: true },
    );
  };

  return (
    <>
      <h1>Your profile</h1>
      {isLoaded ? (
        <form onSubmit={(event) => void submit(event)} noValidate>
          <FormField label="Display name" value={form.displayName} onChange={change('displayName')} autoComplete="name" />
          <SelectField label="Preferred currency" options={CURRENCIES} value={form.preferredCurrency} onChange={change('preferredCurrency')} />
          <SelectField label="Default travel style" options={TRAVEL_STYLES} value={form.defaultTravelStyle} onChange={change('defaultTravelStyle')} />
          <SelectField label="Food preference" options={FOOD_PREFERENCES} value={form.foodPreference} onChange={change('foodPreference')} />
          <NotificationSwitches legend="Email notifications" settings={form.notifications} onChange={switchNotification} />
          <p className="hint">Confirmation and password reset emails, and Plans you share, are always sent.</p>
          <button type="submit">Save profile</button>
        </form>
      ) : null}
      {message ? <p role={message.isError ? 'alert' : 'status'}>{message.text}</p> : null}
    </>
  );
}
