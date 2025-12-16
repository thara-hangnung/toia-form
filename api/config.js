export default function handler(request, response) {
  response.status(200).json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  });
}
