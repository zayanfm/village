import { Schema, model, InferSchemaType } from 'mongoose';

// interiors — YOUTH-ONLY hierarchical room data. Deep/irregular nested tree:
// each room has a zones array (pinboard / ai_companion / bookshelf anchors,
// matching YouthRoomHome FOCUS_TARGETS) and an arbitrary props array.

const ZoneSchema = new Schema(
  {
    type: { type: String, required: true }, // 'pinboard' | 'ai_companion' | 'bookshelf' | ...
    anchor: { type: [Number], required: true }, // [x, y, z]
    route: { type: String }, // optional navigation target
  },
  { _id: false }
);

const PropSchema = new Schema(
  {
    id: { type: String, required: true },
    mesh: { type: String, required: true },
    transform: { type: Schema.Types.Mixed }, // { p:[x,y,z], r?:[...], s?:number }
  },
  { _id: false }
);

const RoomSchema = new Schema(
  {
    key: { type: String, required: true }, // 'home', ...
    accent: { type: String },
    zones: { type: [ZoneSchema], default: [] },
    props: { type: [PropSchema], default: [] },
  },
  { _id: false }
);

const InteriorSchema = new Schema(
  {
    youthId: { type: String, required: true, index: true, unique: true },
    rooms: { type: [RoomSchema], default: [] },
  },
  { timestamps: true, collection: 'interiors' }
);

export type Interior = InferSchemaType<typeof InteriorSchema>;
export const InteriorModel = model('Interior', InteriorSchema);
