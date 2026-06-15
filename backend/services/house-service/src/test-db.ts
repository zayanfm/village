import './loadEnv';
import { connect, mongoose } from './db';
import { HouseDesignModel } from './models/HouseDesign';

// Connects to MongoDB and does a real write/read round-trip through the
// HouseDesign model (then cleans up the probe document).
async function main() {
  await connect();
  const probe = await HouseDesignModel.create({
    ownerYouthId: 'healthcheck-youth',
    config: { houseStyle: 'village', colorTheme: 'Pastel Mint' },
  });
  const found = await HouseDesignModel.findById(probe._id).lean();
  await HouseDesignModel.deleteOne({ _id: probe._id });
  console.log(
    `[house-service] ✅ MongoDB reachable on :27017 — wrote+read house_design ${found?._id}`
  );
}

main()
  .catch((e) => {
    console.error('[house-service] ❌ DB test failed:', e.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
