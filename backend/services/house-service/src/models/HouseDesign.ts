import { Schema, model, InferSchemaType } from 'mongoose';

// house_designs — the shared/collaborative EXTERIOR. `config` mirrors the
// frontend `youthHouseConfig` verbatim (youthTheme.js). `workerView` is the
// cached projection produced by toWorkerHouseConfig() for the worker village.

const PropsSchema = new Schema(
  {
    flowers: { type: Boolean, default: true },
    lamps: { type: Boolean, default: false },
    pond: { type: Boolean, default: false },
  },
  { _id: false }
);

const HouseConfigSchema = new Schema(
  {
    houseStyle: { type: String, enum: ['village', 'mansion', 'futuristic'], default: 'village' },
    colorTheme: { type: String, default: 'Pastel Mint' },
    roofStyle: { type: String, default: 'Terracotta Tiles' },
    windowColor: { type: String, default: '#FFE3A3' },
    windowIntensity: { type: Number, default: 0.6, min: 0, max: 1.5 },
    props: { type: PropsSchema, default: () => ({}) },
  },
  { _id: false }
);

const CollaboratorSchema = new Schema(
  {
    userId: { type: String, required: true },
    role: { type: String, enum: ['youth', 'worker'], required: true },
    access: { type: String, enum: ['view', 'coedit'], default: 'view' },
  },
  { _id: false }
);

const HouseDesignSchema = new Schema(
  {
    ownerYouthId: { type: String, required: true, index: true },
    collaborators: { type: [CollaboratorSchema], default: [] },
    version: { type: Number, default: 1 },
    config: { type: HouseConfigSchema, required: true, default: () => ({}) },
    workerView: { type: Schema.Types.Mixed }, // derived via toWorkerHouseConfig()
  },
  { timestamps: true, collection: 'house_designs' }
);

export type HouseDesign = InferSchemaType<typeof HouseDesignSchema>;
export const HouseDesignModel = model('HouseDesign', HouseDesignSchema);
