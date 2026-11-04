import mongoose, { Document, Schema, Types } from 'mongoose';
import { ClientSession } from 'mongoose';

export interface ICounter extends Document {
  _id: Types.ObjectId;
  key: string;
  seq: number;
  prefix?: string;
  updatedAt: Date;
}

const CounterSchema = new Schema<ICounter>(
  {
    key: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
    prefix: { type: String },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const CounterModel = mongoose.model<ICounter>('Counter', CounterSchema);

export async function getNextSequence(
  key: string,
  prefix: string,
  width: number,
  session?: ClientSession
): Promise<string> {
  const counter = await CounterModel.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 }, $setOnInsert: { prefix } },
    { new: true, upsert: true, session }
  );
  if (!counter) {
    throw new Error(`Failed to allocate sequence for ${key}`);
  }
  return `${prefix}${String(counter.seq).padStart(width, '0')}`;
}