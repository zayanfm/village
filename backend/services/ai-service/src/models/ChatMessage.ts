import { Schema, model, InferSchemaType } from 'mongoose';

const ChatMessageSchema = new Schema(
  {
    youthId:   { type: String, required: true, index: true },
    role:      { type: String, enum: ['user', 'assistant'], required: true },
    content:   { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, collection: 'chat_messages' }
);

export type ChatMessage = InferSchemaType<typeof ChatMessageSchema>;
export const ChatMessageModel = model('ChatMessage', ChatMessageSchema);
