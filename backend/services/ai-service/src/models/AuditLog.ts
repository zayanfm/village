import { Schema, model, InferSchemaType } from 'mongoose';

const AuditLogSchema = new Schema(
  {
    action:      { type: String, enum: ['generated', 'viewed', 'refreshed'], required: true },
    youthId:     { type: String, required: true, index: true },
    performedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, collection: 'audit_logs' }
);

export type AuditLog = InferSchemaType<typeof AuditLogSchema>;
export const AuditLogModel = model('AuditLog', AuditLogSchema);
