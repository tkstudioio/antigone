import "dotenv/config";
import { db } from "@/db";

function generateProducts(count: number) {
  const genres = [
    "Action",
    "Adventure",
    "RPG",
    "Strategy",
    "Puzzle",
    "Shooter",
    "Racing",
    "Sports",
    "Simulation",
    "Horror",
    "Fantasy",
    "Sci-Fi",
    "Mystery",
    "Platformer",
    "Fighting",
  ];

  const adjectives = [
    "Dark",
    "Lost",
    "Legendary",
    "Infinite",
    "Shadow",
    "Eternal",
    "Ancient",
    "Hidden",
    "Ultimate",
    "Mystic",
    "Cosmic",
    "Wild",
    "Savage",
    "Divine",
    "Epic",
  ];

  const nouns = [
    "Quest",
    "Kingdom",
    "Realm",
    "Fortress",
    "Temple",
    "Abyss",
    "Void",
    "Chronicles",
    "Wars",
    "Legacy",
    "Saga",
    "Chronicles",
    "Crusade",
    "Expedition",
    "Journey",
  ];

  const products: Array<{
    name: string;
    slug: string;
    description: string;
    rating: number;
    imageUrl: string;
  }> = [];

  for (let i = 1; i <= count; i++) {
    const genre = genres[rand(0, genres.length - 1)];
    const adj = adjectives[rand(0, adjectives.length - 1)];
    const noun = nouns[rand(0, nouns.length - 1)];
    const name = `${adj} ${noun} ${i}`;
    const slug = `game-${String(i).padStart(4, "0")}`;

    products.push({
      name,
      slug,
      description: `${genre} game - ${name}. Un'esperienza affascinante e coinvolgente.`,
      rating: 3 + Math.random() * 2,
      imageUrl: `https://picsum.photos/seed/${slug}/640/360`,
    });
  }

  return products;
}

const productList = generateProducts(10);

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedProducts() {
  await db.product.createMany({
    data: productList,
    skipDuplicates: true,
  });
}

async function seed() {
  await seedProducts();
}

seed()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seed failed", error);
    await db.$disconnect();
    process.exit(1);
  });
