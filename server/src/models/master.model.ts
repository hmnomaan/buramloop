import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  MATERIAL_KINDS,
  MATERIAL_UNITS,
  MaterialUnit,
  QUALITY_GRADE_CODES,
} from '../../../shared/src/schemas/master';

export interface IMaterial extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  kind: (typeof MATERIAL_KINDS)[number];
  category: string;
  unit: MaterialUnit;
  defaultDrumKg?: number;
  defaultPackageType?: string;
  isAllergen: boolean;
  countsTowardOrigin: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialSchema = new Schema<IMaterial>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: MATERIAL_KINDS, required: true, index: true },
    category: { type: String, required: true, trim: true },
    unit: { type: String, enum: MATERIAL_UNITS, required: true, default: 'kg' },
    defaultDrumKg: { type: Number, min: 0, default: 290 },
    defaultPackageType: { type: String, trim: true, maxlength: 60 },
    isAllergen: { type: Boolean, default: false },
    countsTowardOrigin: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const MaterialModel = mongoose.model<IMaterial>('Material', MaterialSchema);

export interface IQualityGrade extends Document {
  _id: Types.ObjectId;
  code: (typeof QUALITY_GRADE_CODES)[number] | string;
  name: string;
  rank: number;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QualityGradeSchema = new Schema<IQualityGrade>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    rank: { type: Number, required: true, min: 1 },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const QualityGradeModel = mongoose.model<IQualityGrade>('QualityGrade', QualityGradeSchema);