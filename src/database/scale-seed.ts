import dataSource from './data-source';
import { SeedData, insertSeedData } from './seed';

export interface ScaleOptions {
  patients: number;
  readingsPerPatient: number;
  days: number;
  startedAt: Date;
  seed: number;
}

export const SCALE_ID_PREFIX = 'scale-';

const DEFAULTS: ScaleOptions = {
  patients: 50,
  readingsPerPatient: 500,
  days: 30,
  startedAt: new Date('2024-06-01T00:00:00Z'),
  seed: 42,
};

// Deterministic so a test can compute the expected aggregates from the same data the
// database was filled with, rather than asserting numbers copied by hand.
function pseudoRandom(state: number): number {
  return (state * 1103515245 + 12345) % 2147483648;
}

export function generateScaleData(options: Partial<ScaleOptions> = {}): SeedData {
  const { patients, readingsPerPatient, days, startedAt, seed } = { ...DEFAULTS, ...options };

  const data: SeedData = { patients: [], heartRateReadings: [] };
  const stepMs = (days * 24 * 60 * 60 * 1000) / readingsPerPatient;
  let state = seed;

  for (let index = 0; index < patients; index++) {
    const id = `${SCALE_ID_PREFIX}${index + 1}`;
    data.patients.push({
      id,
      name: `Scale Patient ${index + 1}`,
      age: 20 + (index % 60),
      gender: index % 2 === 0 ? 'female' : 'male',
    });

    for (let reading = 0; reading < readingsPerPatient; reading++) {
      state = pseudoRandom(state);
      data.heartRateReadings.push({
        patientId: id,
        // Every patient shares the same instants, which is what a fleet of devices on one
        // sampling schedule looks like, and it exercises the id tiebreak in pagination.
        timestamp: new Date(startedAt.getTime() + reading * stepMs).toISOString(),
        heartRate: 55 + (state % 90),
      });
    }
  }

  return data;
}

async function main(): Promise<void> {
  const options: Partial<ScaleOptions> = {
    patients: Number(process.env.SCALE_PATIENTS ?? DEFAULTS.patients),
    readingsPerPatient: Number(process.env.SCALE_READINGS ?? DEFAULTS.readingsPerPatient),
  };

  const data = generateScaleData(options);
  await dataSource.initialize();
  try {
    await insertSeedData(dataSource, data);
    console.log(
      `Seeded ${data.patients.length} patients and ${data.heartRateReadings.length} readings`,
    );
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Scale seed failed', error);
    process.exit(1);
  });
}
