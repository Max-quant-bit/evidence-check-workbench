import "dotenv/config";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
app.listen(port, "127.0.0.1", () => {
  console.log(`Evidence Check API listening on port ${port}`);
});
