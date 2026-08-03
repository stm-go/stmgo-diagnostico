import {
  SUPABASE_URL,
  SUPABASE_KEY,
} from "./supabase-config.js";

async function testarConexao() {
  const status = document.getElementById(
    "supabase-status"
  );

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/diagnostics?select=id&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();

      throw new Error(
        `${response.status}: ${error}`
      );
    }

    status.textContent =
      "Supabase conectado com sucesso.";

    status.style.color = "#15803d";
  } catch (error) {
    console.error(error);

    status.textContent =
      "Não foi possível conectar ao Supabase.";

    status.style.color = "#b91c1c";
  }
}

testarConexao();