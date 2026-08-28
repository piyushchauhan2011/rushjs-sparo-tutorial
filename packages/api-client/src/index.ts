import type {
  AuthResponse,
  Booking,
  CreateBookingRequest,
  HotelSearchQuery,
  HotelWithRoomTypes,
  LoginRequest,
  RegisterRequest,
  RoomAvailability,
} from '@hotel/shared-types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => string | null;
}

export function createApiClient({ baseUrl, getToken }: ApiClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getToken?.();
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({ message: response.statusText }))) as {
        message?: string;
      };
      throw new ApiError(response.status, body.message ?? 'Request failed');
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    listHotels(query: HotelSearchQuery = {}) {
      const params = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][],
      );
      const qs = params.toString();
      return request<HotelWithRoomTypes[]>(`/hotels${qs ? `?${qs}` : ''}`);
    },

    getHotel(hotelId: string) {
      return request<HotelWithRoomTypes>(`/hotels/${hotelId}`);
    },

    checkAvailability(hotelId: string, checkIn: string, checkOut: string) {
      const params = new URLSearchParams({ checkIn, checkOut });
      return request<RoomAvailability[]>(`/hotels/${hotelId}/availability?${params.toString()}`);
    },

    createBooking(body: CreateBookingRequest) {
      return request<Booking>('/bookings', { method: 'POST', body: JSON.stringify(body) });
    },

    myBookings() {
      return request<Booking[]>('/bookings/me');
    },

    register(body: RegisterRequest) {
      return request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) });
    },

    login(body: LoginRequest) {
      return request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
