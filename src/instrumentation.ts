// Roda uma vez quando o servidor sobe: cria o banco se preciso, aplica as
// migrations e deixa a cópia de segurança, antes da primeira requisição.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bancoDoApp } = await import("./servidor/app");
  bancoDoApp();
}
