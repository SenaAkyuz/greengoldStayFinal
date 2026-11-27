import type { Metadata } from 'next';
import { requireAccessToken } from '@/lib/auth';
import { getHotel } from '@/lib/api';
import { connecthub, userMessage } from '@/lib/connecthub';
import { HotelPanelFrame } from '../components/panel/HotelPanelFrame';
import { ProfileView } from '../components/panel/ProfileView';
import { saveFacilityProfile } from './actions';

export const metadata: Metadata = { title: 'Tesis profili' };

/** Tesis profili (D aşaması) — GET/PUT …/connecthub/status · /profile. */
export default async function FacilityProfilePage() {
  const token = await requireAccessToken();
  const [hotelRes, statusRes] = await Promise.all([getHotel(token), connecthub.status(token)]);
  const hotel = hotelRes.data;
  const isDemo = hotel?.role === 'demo_viewer';

  return (
    <HotelPanelFrame hotelName={hotel?.hotel_name} city={hotel?.city} isDemo={isDemo} title="Tesis profili">
      <ProfileView
        status={statusRes.data}
        statusError={statusRes.error ? userMessage(statusRes) : null}
        isDemo={isDemo}
        action={saveFacilityProfile}
      />
    </HotelPanelFrame>
  );
}
