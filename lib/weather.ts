/** Open-Meteo: no key, no account. Geocode the city once, then read the current weather. */

const WORDS: [number[], string][] = [
  [[0], 'Clear'], [[1], 'Mostly clear'], [[2], 'Partly cloudy'], [[3], 'Overcast'],
  [[45, 48], 'Fog'], [[51, 53, 55, 56, 57], 'Drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain'],
  [[71, 73, 75, 77, 85, 86], 'Snow'], [[95, 96, 99], 'Thunderstorm'],
];

export function weatherCode(code: number): string {
  return WORDS.find(([codes]) => codes.includes(code))?.[1] ?? 'Weather';
}

export type Weather = { city: string; temp: number; feels: number; code: number; rainChance: number; high: number; low: number };

export async function fetchWeather(city: string, signal?: AbortSignal): Promise<Weather> {
  const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`, { signal }).then(r => r.json());
  const place = g?.results?.[0];
  if (!place) throw new Error(`Could not find “${city}”. Try a nearby city name.`);
  const q = `latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto`;
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal }).then(r => r.json());
  return {
    city: place.name,
    temp: Math.round(w.current.temperature_2m),
    feels: Math.round(w.current.apparent_temperature),
    code: w.current.weather_code,
    rainChance: w.daily.precipitation_probability_max?.[0] ?? 0,
    high: Math.round(w.daily.temperature_2m_max[0]),
    low: Math.round(w.daily.temperature_2m_min[0]),
  };
}
