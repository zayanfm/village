import { Schema, model, InferSchemaType } from 'mongoose';

const EmotionalEventSchema = new Schema(
  {
    timestamp:      { type: String, required: true },
    emotionalState: { type: String, required: true },
    confidenceScore:{ type: Number, min: 0, max: 1, default: 0.5 },
  },
  { _id: false }
);

const ConversationSummarySchema = new Schema(
  {
    youthId:             { type: String, required: true, index: true },
    summary:             { type: String, required: true },
    emotionalTrajectory: { type: [EmotionalEventSchema], default: [] },
    themes:              { type: [String], default: [] },
    actionItems:         { type: [String], default: [] },
    riskLevel:           { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    riskReason:          { type: String, default: '' },
    generatedAt:         { type: Date, default: Date.now },
    messageCount:        { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'conversation_summaries' }
);

export type ConversationSummary = InferSchemaType<typeof ConversationSummarySchema>;
export const ConversationSummaryModel = model('ConversationSummary', ConversationSummarySchema);
