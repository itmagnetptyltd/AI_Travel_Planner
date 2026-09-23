import { useEffect, useState, type FormEvent } from 'react';
import { CURRENCIES } from '../../shared/currencies';
import { FOOD_PREFERENCES } from '../../shared/food-preferences';
import { TRAVEL_STYLES } from '../../shared/travel-styles';
import { api } from '../api-client';
import { FormField } from '../components/FormField';
import { SelectField } from '../components/SelectField';

interface ProfileForm {
  readonly displayName: string;
  readonly preferredCurrency: string;
  readonly defaultTravelStyle: string;
  readonly foodPreference: string;
}

type ProfileResponse = { readonly [K in keyof ProfileForm]: string | null };

const EMPTY_FORM: ProfileForm = { displayName: '', preferredCurrency: '', defaultTravelStyle: '', foodPreference: '' };

const toForm = (profile: ProfileResponse): ProfileForm => ({
  displayName: profile.displayName ?? '',
  preferredCurrency: profile.preferredCurrency ?? '',
  defaultTravelStyle: profile.defaultTravelStyle ?? '',
  foodPreference: profile.foodPreference ?? '',
});

/** An empty field is saved as "not set". */
const toUpdate = (form: ProfileForm): ProfileResponse => ({
  displayName: form.displayName.trim() || null,
  preferredCurrency: form.preferredCurrency || null,
  defaultTravelStyle: form.defaultTravelStyle || null,
  foodPreference: form.foodPreference || null,
});

export function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [message, setMessage] = useState<{ readonly text: string; readonly isError: boolean } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void api<ProfileResponse>('GET', '/api/profile').then((result) => {
      if (!isCurrent) return;
      if (result.ok) setForm(toForm(result.data));
      else setMessage({ text: result.error.message ?? 'Your profile could not be loaded.', isError: true });
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  const change = (field: keyof ProfileForm) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
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
      <form onSubmit={(event) => void submit(event)} noValidate>
        <FormField label="Display name" value={form.displayName} onChange={change('displayName')} autoComplete="name" />
        <SelectField label="Preferred currency" options={CURRENCIES} value={form.preferredCurrency} onChange={change('preferredCurrency')} />
        <SelectField label="Default travel style" options={TRAVEL_STYLES} value={form.defaultTravelStyle} onChange={change('defaultTravelStyle')} />
        <SelectField label="Food preference" options={FOOD_PREFERENCES} value={form.foodPreference} onChange={change('foodPreference')} />
        <button type="submit">Save profile</button>
      </form>
      {message ? <p role={message.isError ? 'alert' : 'status'}>{message.text}</p> : null}
    </>
  );
}
