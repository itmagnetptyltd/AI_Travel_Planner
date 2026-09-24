import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api-client';
import { durationLabel, type Destination } from './destination';

type DetailState =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly destination: Destination }
  | { readonly state: 'failed'; readonly message: string };

/** What a Traveler sees when choosing a Destination (REQ-TRV-072). Every value is rendered as text. */
export function DestinationDetailPage() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<DetailState>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    void api<Destination>('GET', `/api/destinations/${encodeURIComponent(id)}`).then((result) => {
      if (!isCurrent) return;
      setDetail(
        result.ok
          ? { state: 'loaded', destination: result.data }
          : { state: 'failed', message: result.error.message ?? 'This Destination could not be loaded.' },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [id]);

  if (detail.state === 'loading') return <p>Loading…</p>;
  if (detail.state === 'failed') return <p role="alert">{detail.message}</p>;
  const { destination } = detail;

  return (
    <>
      <h1>{destination.name}</h1>
      <p>{destination.country}</p>
      <dl>
        <dt>Description</dt>
        <dd>{destination.description}</dd>
        <dt>Popular activities</dt>
        <dd>{destination.popularActivities}</dd>
        <dt>Recommended duration</dt>
        <dd>{durationLabel(destination.recommendedDurationDays)}</dd>
        <dt>Travel information</dt>
        <dd>{destination.travelInformation}</dd>
      </dl>
    </>
  );
}
