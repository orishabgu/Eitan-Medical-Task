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
  patients: 500000,
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

// Yields one group of patients at a time. A large run holds only the current group in
// memory, so the dataset size is bounded by the database rather than by the Node heap.
export function* generateScaleBatches(
  options: Partial<ScaleOptions> = {},
  patientsPerBatch = 200,
): Generator<SeedData> {
  const { patients, readingsPerPatient, days, startedAt, seed } = { ...DEFAULTS, ...options };
  const stepMs = (days * 24 * 60 * 60 * 1000) / readingsPerPatient;
  let state = seed;

  for (let first = 0; first < patients; first += patientsPerBatch) {
    const batch: SeedData = { patients: [], heartRateReadings: [] };
    const last = Math.min(first + patientsPerBatch, patients);

    for (let index = first; index < last; index++) {
      const id = `${SCALE_ID_PREFIX}${index + 1}`;
      batch.patients.push({
        id,
        name: `Scale Patient ${index + 1}`,
        age: 20 + (index % 60),
        gender: index % 2 === 0 ? 'female' : 'male',
      });

      for (let reading = 0; reading < readingsPerPatient; reading++) {
        state = pseudoRandom(state);
        batch.heartRateReadings.push({
          patientId: id,
          // Every patient shares the same instants, which is what a fleet of devices on one
          // sampling schedule looks like, and it exercises the id tiebreak in pagination.
          timestamp: new Date(startedAt.getTime() + reading * stepMs).toISOString(),
          heartRate: 55 + (state % 90),
        });
      }
    }

    yield batch;
  }
}

// Materialises everything at once. Convenient for tests, which use small sizes.
export function generateScaleData(options: Partial<ScaleOptions> = {}): SeedData {
  const data: SeedData = { patients: [], heartRateReadings: [] };

  for (const batch of generateScaleBatches(options)) {
    data.patients.push(...batch.patients);
    data.heartRateReadings.push(...batch.heartRateReadings);
  }

  return data;
}

async function main(): Promise<void> {
  const options: Partial<ScaleOptions> = {
    patients: Number(process.env.SCALE_PATIENTS ?? DEFAULTS.patients),
    readingsPerPatient: Number(process.env.SCALE_READINGS ?? DEFAULTS.readingsPerPatient),
  };
  const total = (options.patients ?? 0) * (options.readingsPerPatient ?? 0);

  await dataSource.initialize();
  const startedAt = Date.now();
  let patients = 0;
  let readings = 0;

  try {
    for (const batch of generateScaleBatches(options)) {
      await insertSeedData(dataSource, batch);
      patients += batch.patients.length;
      readings += batch.heartRateReadings.length;

      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = Math.round(readings / elapsed);
      const remaining = rate > 0 ? Math.round((total - readings) / rate) : 0;
      process.stdout.write(
        `\r${readings}/${total} readings, ${patients} patients, ${rate}/s, ~${remaining}s left   `,
      );
    }
    process.stdout.write('\n');
    console.log(`Seeded ${patients} patients and ${readings} readings`);
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
