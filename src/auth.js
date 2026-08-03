import {
  SUPABASE_URL,
  SUPABASE_KEY,
} from "./supabase-config.js";

const createClient =
  window.supabase?.createClient;

if (!createClient) {
  throw new Error(
    "A biblioteca do Supabase não foi carregada."
  );
}

export const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

function mostrarTelaLogin() {
  document
    .getElementById("screen-login")
    .classList.remove("hidden");

  document
    .getElementById("screen-home")
    .classList.add("hidden");
}

function mostrarAplicativo(session) {
  document
    .getElementById("screen-login")
    .classList.add("hidden");

  document
    .getElementById("screen-home")
    .classList.remove("hidden");

  const userLabel =
    document.getElementById("loggedUser");

  if (userLabel) {
    userLabel.textContent =
      session?.user?.email ||
      "Usuário autenticado";
  }
}

async function verificarSessao() {
  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error(
      "Erro ao verificar sessão:",
      error
    );

    mostrarTelaLogin();
    return;
  }

  if (session) {
    console.log(
      "Usuário autenticado:",
      session.user.email
    );

    mostrarAplicativo(session);
  } else {
    mostrarTelaLogin();
  }
}

async function fazerLogin() {
  const email = document
    .getElementById("loginEmail")
    .value
    .trim();

  const password = document
    .getElementById("loginPassword")
    .value;

  const errorBox =
    document.getElementById("loginError");

  const button =
    document.getElementById("loginBtn");

  errorBox.classList.add("hidden");

  if (!email || !password) {
    errorBox.textContent =
      "Preencha o e-mail e a senha.";

    errorBox.classList.remove("hidden");
    return;
  }

  button.disabled = true;
  button.textContent = "Entrando...";

  const {
    data,
    error,
  } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  button.disabled = false;
  button.textContent = "Entrar";

  if (error) {
    console.error(
      "Erro no login:",
      error
    );

    errorBox.textContent =
      "E-mail ou senha inválidos.";

    errorBox.classList.remove("hidden");
    return;
  }

  console.log(
    "Login realizado:",
    data.user.email
  );

  mostrarAplicativo(data.session);
}

document
  .getElementById("loginForm")
  .addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      await fazerLogin();
    }
  );

async function sairDaConta() {
  const button =
    document.getElementById("logoutBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Saindo...";
  }

  const { error } =
    await supabaseClient.auth.signOut({
      scope: "local",
    });

  if (button) {
    button.disabled = false;
    button.textContent = "Sair";
  }

  if (error) {
    console.error(
      "Erro ao sair:",
      error
    );

    alert(
      "Não foi possível encerrar a sessão."
    );

    return;
  }

  document
    .getElementById("screen-home")
    .classList.add("hidden");

  document
    .getElementById("screen-questions")
    .classList.add("hidden");

  document
    .getElementById("screen-client")
    .classList.add("hidden");

  document
    .getElementById("screen-review")
    .classList.add("hidden");

  document
    .getElementById("screen-history")
    .classList.add("hidden");

  document
    .getElementById("screen-result")
    .classList.add("hidden");

  document
    .getElementById("screen-login")
    .classList.remove("hidden");

  document
    .getElementById("loginPassword")
    .value = "";
}

document
  .getElementById("logoutBtn")
  .addEventListener(
    "click",
    sairDaConta
  );

function esconderAplicativo() {
  const screens = [
    "home",
    "questions",
    "client",
    "review",
    "history",
    "result",
  ];

  screens.forEach((screen) => {
    document
      .getElementById(`screen-${screen}`)
      ?.classList.add("hidden");
  });

  document
    .getElementById("screen-login")
    ?.classList.remove("hidden");

  const password =
    document.getElementById(
      "loginPassword"
    );

  if (password) {
    password.value = "";
  }
}

verificarSessao();