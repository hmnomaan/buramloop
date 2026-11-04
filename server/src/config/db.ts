// server/src/config/db.ts
import mongoose, { ClientSession } from 'mongoose';
import { env } from './env';
import { syncAllModelIndexes } from '../models';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI);
  await syncAllModelIndexes();
  console.log('[DB] Connected to MongoDB Replica Set & verified indexes');
}

/**
 * Executes a callback inside an ACID MongoDB Replica Set transaction.
 * Automatically commits on success or aborts on any thrown error.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      }
    );
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Executes a multi-collection read query under 'snapshot' isolation
 * (used by Step 5k Exports and Step 5j Traceability so data never tears mid-query).
 */
export async function withSnapshotRead<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      readPreference: 'primary',
    });
    const data = await fn(session);
    await session.commitTransaction();
    return data;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    await session.endSession();
  }
}