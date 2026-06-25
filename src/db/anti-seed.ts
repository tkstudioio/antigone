import "dotenv/config";
import { db } from "@/db";

async function deleteAll() {
  const [
    messages,
    reviews,
    orders,
    escrows,
    favorites,
    chats,
    keys,
    products,
    challenges,
    accounts,
  ] = await db.$transaction([
    db.message.deleteMany(),
    db.review.deleteMany(),
    db.order.deleteMany(),
    db.escrow.deleteMany(),
    db.favorite.deleteMany(),
    db.chat.deleteMany(),
    db.key.deleteMany(),
    db.product.deleteMany(),
    db.challenge.deleteMany(),
    db.account.deleteMany(),
  ]);

  console.log("Deleted:");
  console.log(`  messages:   ${messages.count}`);
  console.log(`  reviews:    ${reviews.count}`);
  console.log(`  orders:     ${orders.count}`);
  console.log(`  escrows:    ${escrows.count}`);
  console.log(`  favorites:  ${favorites.count}`);
  console.log(`  chats:      ${chats.count}`);
  console.log(`  keys:       ${keys.count}`);
  console.log(`  products:   ${products.count}`);
  console.log(`  challenges: ${challenges.count}`);
  console.log(`  accounts:   ${accounts.count}`);
}

deleteAll()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Anti-seed failed", error);
    await db.$disconnect();
    process.exit(1);
  });
