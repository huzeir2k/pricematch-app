import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Store from '../models/Store.js';
import Deal from '../models/Deal.js';

dotenv.config();

const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const seedStores = async () => {
  console.log('\n📍 Seeding Food Basics stores...');

  const stores = [
    {
      chainName: 'Food Basics',
      storeName: 'Food Basics - Downtown Toronto',
      postalCode: 'M5H 2N2',
      province: 'ON',
      address: '123 King St W, Toronto, ON',
      coordinates: {
        type: 'Point',
        coordinates: [-79.3833, 43.6532], // Toronto downtown
      },
      phoneNumber: '(416) 555-0101',
      website: 'https://www.foodbasics.ca',
    },
    {
      chainName: 'Food Basics',
      storeName: 'Food Basics - Mississauga',
      postalCode: 'L5B 1M1',
      province: 'ON',
      address: '456 Dundas St E, Mississauga, ON',
      coordinates: {
        type: 'Point',
        coordinates: [-79.6441, 43.5891], // Mississauga
      },
      phoneNumber: '(905) 555-0102',
      website: 'https://www.foodbasics.ca',
    },
    {
      chainName: 'Food Basics',
      storeName: 'Food Basics - Vancouver',
      postalCode: 'V6B 2R3',
      province: 'BC',
      address: '789 Granville St, Vancouver, BC',
      coordinates: {
        type: 'Point',
        coordinates: [-123.1127, 49.2827], // Vancouver
      },
      phoneNumber: '(604) 555-0103',
      website: 'https://www.foodbasics.ca',
    },
    {
      chainName: 'Food Basics',
      storeName: 'Food Basics - Montreal',
      postalCode: 'H1A 1A1',
      province: 'QC',
      address: '321 Rue Sainte-Catherine, Montreal, QC',
      coordinates: {
        type: 'Point',
        coordinates: [-73.5673, 45.5017], // Montreal
      },
      phoneNumber: '(514) 555-0104',
      website: 'https://www.foodbasics.ca',
    },
    {
      chainName: 'Food Basics',
      storeName: 'Food Basics - Calgary',
      postalCode: 'T2P 1N1',
      province: 'AB',
      address: '654 Stephen Ave SW, Calgary, AB',
      coordinates: {
        type: 'Point',
        coordinates: [-114.0719, 51.0447], // Calgary
      },
      phoneNumber: '(403) 555-0105',
      website: 'https://www.foodbasics.ca',
    },
  ];

  try {
    const insertedStores = await Store.insertMany(stores);
    console.log(`✓ Created ${insertedStores.length} stores`);
    return insertedStores;
  } catch (error) {
    console.error('✗ Error seeding stores:', error.message);
    throw error;
  }
};

const seedDeals = async (stores) => {
  console.log('\n🏷️  Seeding sample deals...');

  const deals = [];
  const categories = ['grocery', 'dairy', 'meat', 'bakery', 'electronics', 'household', 'personal-care'];

  // Create 10 sample deals for each store
  for (const store of stores) {
    for (let i = 0; i < 10; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const originalPrice = Math.floor(Math.random() * 50) + 5;
      const salePrice = originalPrice * 0.75; // 25% discount
      const priceAfterTax = salePrice * 1.13; // 13% HST

      deals.push({
        storeId: store._id,
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} Item #${i + 1}`,
        description: `Premium ${category} product on sale`,
        originalPrice,
        salePrice: parseFloat(salePrice.toFixed(2)),
        priceAfterTax: parseFloat(priceAfterTax.toFixed(2)),
        discountPercentage: 25,
        category,
        expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
        flyer: {
          url: 'https://www.foodbasics.ca/flyer',
          source: 'html',
          scrapedAt: new Date(),
        },
      });
    }
  }

  try {
    const insertedDeals = await Deal.insertMany(deals);
    console.log(`✓ Created ${insertedDeals.length} deals`);
  } catch (error) {
    console.error('✗ Error seeding deals:', error.message);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDatabase();

    // Clear existing data
    console.log('\n🗑️  Clearing existing data...');
    await Store.deleteMany({});
    await Deal.deleteMany({});
    console.log('✓ Database cleared');

    // Seed stores and deals
    const stores = await seedStores();
    await seedDeals(stores);

    console.log('\n✅ Database seeding complete!');
    console.log(`\n📊 Summary:`);
    console.log(`   • ${stores.length} stores created`);
    console.log(`   • ${stores.length * 10} deals created`);
    console.log(`\n🚀 Your backend is ready to test!`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

main();
