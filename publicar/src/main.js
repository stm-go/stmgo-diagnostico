import {
  salvarDiagnostico,
  listarDiagnosticos,
  excluirDiagnostico,
  atualizarDiagnostico,
} from "./supabase-api.js";

const CONFIG = await loadConfig();
const STORAGE_KEY =
  "stmgo-diagnostico-draft-v1";
const LEGACY_STORAGE_KEY =
  "stmgo-diagnostico-passo-4-draft";

const APP_SCREENS = [
  "home",
  "questions",
  "client",
  "review",
  "history",
  "result",
];

const PAGE_SIZE = 8;

const emptyState = () => ({
  sectionIndex: 0,
  answers: {},
  client: {},
  updatedAt: null,
  remoteRecordId: null,
  lastResult: null,
  completedAt: null,
});

let state = emptyState();

let historyState = {
  page: 1,
  pageSize: PAGE_SIZE,
  search: "",
  maturity: "",
  total: 0,
  records: [],
};

let historySearchTimer = null;

async function loadConfig() {
  const response = await fetch(
    "./diagnostic-config.json",
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      "Não foi possível carregar a configuração do diagnóstico."
    );
  }

  return response.json();
}

function element(id) {
  return document.getElementById(id);
}

function show(name) {
  APP_SCREENS.forEach((screen) => {
    element(`screen-${screen}`)
      ?.classList.toggle(
        "hidden",
        screen !== name
      );
  });
}

function setStatus(
  message,
  type = "info"
) {
  const status =
    element("supabase-status");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.className =
    `status-toast ${type}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]
    );
}

function formatDate(value) {
  if (!value) {
    return "Data não informada";
  }

  const date = new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? "Data não informada"
    : date.toLocaleString("pt-BR");
}

function answerLabel(value) {
  return (
    CONFIG.answerOptions.find(
      (option) =>
        option.id === value
    )?.label ||
    "Não respondida"
  );
}

function answerScore(id) {
  return (
    CONFIG.answerOptions.find(
      (option) =>
        option.id === id
    )?.score ?? null
  );
}

function saveState() {
  state.updatedAt =
    new Date().toISOString();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );

  updateContinueButton();
}

function loadState() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY
      ) ||
      localStorage.getItem(
        LEGACY_STORAGE_KEY
      );

    const saved =
      JSON.parse(raw || "null");

    if (
      saved?.answers &&
      saved?.client
    ) {
      state = {
        ...emptyState(),
        ...saved,
      };

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
      );

      localStorage.removeItem(
        LEGACY_STORAGE_KEY
      );
    }
  } catch (error) {
    console.error(
      "Não foi possível ler o rascunho.",
      error
    );
  }
}

function clearState() {
  localStorage.removeItem(
    STORAGE_KEY
  );

  localStorage.removeItem(
    LEGACY_STORAGE_KEY
  );

  state = emptyState();
  updateContinueButton();
}

function hasSavedProgress() {
  return (
    Object.keys(
      state.answers || {}
    ).length > 0 ||
    Object.values(
      state.client || {}
    ).some(Boolean)
  );
}

function updateContinueButton() {
  const button =
    element("continueBtn");

  if (!button) {
    return;
  }

  button.classList.toggle(
    "hidden",
    !hasSavedProgress()
  );

  if (
    hasSavedProgress() &&
    state.updatedAt
  ) {
    element(
      "importStatus"
    ).textContent =
      `Último salvamento do rascunho: ${formatDate(state.updatedAt)}`;
  } else if (
    element("importStatus")
      ?.textContent
      .startsWith(
        "Último salvamento"
      )
  ) {
    element(
      "importStatus"
    ).textContent = "";
  }
}

function calculateSection(section) {
  const values =
    section.questions
      .map((question) =>
        answerScore(
          state.answers[
            question.id
          ]?.value
        )
      )
      .filter(
        (value) =>
          value !== null
      );

  return values.length
    ? Math.round(
        values.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / values.length
      )
    : 0;
}

function severityRank(severity) {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }[severity] ?? 0;
}

function buildResult() {
  const scores =
    CONFIG.sections.map(
      (section) => ({
        id: section.id,
        name: section.name,
        score:
          calculateSection(
            section
          ),
      })
    );

  const global =
    Math.round(
      scores.reduce(
        (sum, item) =>
          sum + item.score,
        0
      ) / scores.length
    );

  const level =
    CONFIG.maturityLevels.find(
      (item) =>
        global >= item.min &&
        global <= item.max
    ) ||
    CONFIG.maturityLevels[0];

  const recommendationsByKey =
    new Map(
      CONFIG.recommendations.map(
        (item) => [
          item.key,
          item,
        ]
      )
    );

  const generated =
    new Map();

  for (
    const section
    of CONFIG.sections
  ) {
    for (
      const question
      of section.questions
    ) {
      const answer =
        state.answers[
          question.id
        ];

      if (
        !answer ||
        ![
          "partial",
          "no",
        ].includes(answer.value)
      ) {
        continue;
      }

      const base =
        recommendationsByKey.get(
          question.recommendationKey
        );

      if (!base) {
        continue;
      }

      const severity =
        base.severity?.[
          answer.value
        ] || "medium";

      const evidence = {
        questionId:
          question.id,

        question:
          question.text,

        answer:
          answer.value,

        observation:
          answer.observation || "",
      };

      const existing =
        generated.get(
          base.key
        );

      if (existing) {
        existing.evidence.push(
          evidence
        );

        if (
          severityRank(
            severity
          ) >
          severityRank(
            existing.severity
          )
        ) {
          existing.severity =
            severity;
        }
      } else {
        generated.set(
          base.key,
          {
            key: base.key,
            title:
              base.title,
            description:
              base.description,
            priority:
              base.priority,
            severity,
            evidence: [
              evidence,
            ],
          }
        );
      }
    }
  }

  const recommendations =
    [
      ...generated.values(),
    ]
      .sort(
        (a, b) =>
          severityRank(
            b.severity
          ) -
            severityRank(
              a.severity
            ) ||
          a.priority -
            b.priority
      )
      .slice(0, 10);

  const summary = {
    yes: 0,
    partial: 0,
    no: 0,
    unknown: 0,
    unanswered: 0,
  };

  for (
    const section
    of CONFIG.sections
  ) {
    for (
      const question
      of section.questions
    ) {
      const value =
        state.answers[
          question.id
        ]?.value;

      if (
        value &&
        Object.hasOwn(
          summary,
          value
        )
      ) {
        summary[value] += 1;
      } else {
        summary.unanswered += 1;
      }
    }
  }

  return {
    global,
    level,
    scores,
    recommendations,
    summary,
  };
}

function renderSection() {
  const section =
    CONFIG.sections[
      state.sectionIndex
    ];

  element(
    "stepLabel"
  ).textContent =
    `Etapa ${state.sectionIndex + 1} de 6`;

  element(
    "sectionTitle"
  ).textContent =
    section.name;

  element(
    "sectionDescription"
  ).textContent =
    section.description;

  element(
    "progressBar"
  ).style.width =
    `${((state.sectionIndex + 1) / 6) * 100}%`;

  const container =
    element(
      "questionsContainer"
    );

  container.innerHTML = "";

  section.questions.forEach(
    (question) => {
      const current =
        state.answers[
          question.id
        ] || {
          value: null,
          observation: "",
        };

      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "question";

      wrapper.innerHTML = `
        <div class="question-title">
          ${question.order}. ${escapeHtml(question.text)}
        </div>

        <div class="options">
          ${CONFIG.answerOptions
            .map(
              (option) => `
                <button
                  type="button"
                  class="option ${current.value === option.id ? "selected" : ""}"
                  data-q="${question.id}"
                  data-v="${option.id}"
                >
                  ${escapeHtml(option.label)}
                </button>
              `
            )
            .join("")}
        </div>

        <textarea
          data-obs="${question.id}"
          placeholder="Observação opcional"
        >${escapeHtml(current.observation || "")}</textarea>
      `;

      container.appendChild(
        wrapper
      );
    }
  );

  container
    .querySelectorAll(
      "[data-q]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          state.answers[
            button.dataset.q
          ] = {
            ...(
              state.answers[
                button.dataset.q
              ] || {}
            ),

            value:
              button.dataset.v,
          };

          saveState();
          renderSection();
        }
      );
    });

  container
    .querySelectorAll(
      "[data-obs]"
    )
    .forEach((textarea) => {
      textarea.addEventListener(
        "input",
        () => {
          state.answers[
            textarea.dataset.obs
          ] = {
            ...(
              state.answers[
                textarea.dataset.obs
              ] || {}
            ),

            observation:
              textarea.value,
          };

          saveState();
        }
      );
    });

  element(
    "prevBtn"
  ).style.visibility =
    state.sectionIndex === 0
      ? "hidden"
      : "visible";
}

function sectionMissing(
  section
) {
  return section.questions.filter(
    (question) =>
      !state.answers[
        question.id
      ]?.value
  );
}

const CLIENT_FIELDS = [
  "companyName",
  "contactName",
  "contactEmail",
  "contactPhone",
  "employeeCount",
  "segment",
  "clientNotes",
];

function saveClient() {
  CLIENT_FIELDS.forEach(
    (id) => {
      state.client[id] =
        element(id)
          ?.value.trim() || "";
    }
  );

  saveState();
}

function fillClientForm() {
  CLIENT_FIELDS.forEach(
    (id) => {
      if (element(id)) {
        element(id).value =
          state.client[id] || "";
      }
    }
  );
}

function renderReview() {
  saveClient();

  let answered = 0;
  let unknown = 0;
  let total = 0;

  let html = `
    <div class="review-section">
      <h3>
        ${escapeHtml(state.client.companyName || "Empresa não informada")}
      </h3>

      <div class="review-line">
        <span>Contato</span>
        <strong>
          ${escapeHtml(state.client.contactName || "-")}
        </strong>
      </div>

      <div class="review-line">
        <span>E-mail</span>
        <strong>
          ${escapeHtml(state.client.contactEmail || "-")}
        </strong>
      </div>

      <div class="review-line">
        <span>Segmento</span>
        <strong>
          ${escapeHtml(state.client.segment || "-")}
        </strong>
      </div>
    </div>
  `;

  CONFIG.sections.forEach(
    (section) => {
      const sectionAnswered =
        section.questions.filter(
          (question) =>
            state.answers[
              question.id
            ]?.value
        ).length;

      const sectionUnknown =
        section.questions.filter(
          (question) =>
            state.answers[
              question.id
            ]?.value ===
            "unknown"
        ).length;

      answered +=
        sectionAnswered;

      unknown +=
        sectionUnknown;

      total +=
        section.questions.length;

      html += `
        <div class="review-section">
          <div class="review-line">
            <strong>
              ${escapeHtml(section.name)}
            </strong>

            <span>
              ${sectionAnswered} de ${section.questions.length} respondidas
            </span>
          </div>
        </div>
      `;
    }
  );

  element(
    "reviewContent"
  ).innerHTML = html;

  const messages = [];

  if (answered < total) {
    messages.push(
      `${total - answered} pergunta(s) ainda não respondida(s).`
    );
  }

  if (unknown) {
    messages.push(
      `${unknown} resposta(s) marcada(s) como “Não sei responder” ficarão pendentes.`
    );
  }

  element(
    "reviewWarning"
  ).textContent =
    messages.join(" ");

  element(
    "reviewWarning"
  ).classList.toggle(
    "hidden",
    messages.length === 0
  );
}

function summarizeAnswers(
  answers
) {
  const summary = {
    yes: 0,
    partial: 0,
    no: 0,
    unknown: 0,
    unanswered: 0,
  };

  for (
    const section
    of CONFIG.sections
  ) {
    for (
      const question
      of section.questions
    ) {
      const value =
        answers[
          question.id
        ]?.value;

      if (
        value &&
        Object.hasOwn(
          summary,
          value
        )
      ) {
        summary[value] += 1;
      } else {
        summary.unanswered += 1;
      }
    }
  }

  return summary;
}

function convertSupabaseRecord(
  record
) {
  const level =
    CONFIG.maturityLevels.find(
      (item) =>
        item.name ===
        record.maturity_level
    ) ||
    CONFIG.maturityLevels[0];

  return {
    id:
      record.id,

    completedAt:
      record.created_at,

    updatedAt:
      record.updated_at ||
      record.created_at,

    client: {
      companyName:
        record.company_name ||
        "",

      contactName:
        record.contact_name ||
        "",

      contactEmail:
        record.contact_email ||
        "",

      contactPhone:
        record.contact_phone ||
        "",

      employeeCount:
        record.employee_count ||
        "",

      segment:
        record.segment ||
        "",

      clientNotes:
        record.client_notes ||
        "",
    },

    answers:
      record.answers ||
      {},

    result: {
      global:
        record.global_score,

      level,

      scores: [
        {
          id: "gestao",
          name: "Gestão",
          score:
            record.management_score,
        },
        {
          id: "controle",
          name: "Controle",
          score:
            record.control_score,
        },
        {
          id:
            "disponibilidade",
          name:
            "Disponibilidade",
          score:
            record.availability_score,
        },
        {
          id:
            "rastreabilidade",
          name:
            "Rastreabilidade",
          score:
            record.traceability_score,
        },
      ],

      recommendations:
        record.recommendations ||
        [],

      summary:
        summarizeAnswers(
          record.answers || {}
        ),
    },
  };
}

function renderStoredResult(
  record
) {
  const {
    result,
    client,
  } = record;

  element(
    "resultCompany"
  ).textContent =
    client.companyName ||
    "Cliente";

  const updatedText =
    record.updatedAt &&
    record.updatedAt !==
      record.completedAt
      ? ` · Atualizado em ${formatDate(record.updatedAt)}`
      : "";

  element(
    "resultMeta"
  ).textContent =
    `Criado em ${formatDate(record.completedAt)}${updatedText}`;

  element(
    "globalScore"
  ).textContent =
    `${result.global}%`;

  element(
    "maturityLevel"
  ).textContent =
    result.level.name;

  element(
    "maturityDescription"
  ).textContent =
    result.level.description;

  const details = [
    [
      "Contato",
      client.contactName ||
        "-",
    ],
    [
      "E-mail",
      client.contactEmail ||
        "-",
    ],
    [
      "Telefone",
      client.contactPhone ||
        "-",
    ],
    [
      "Colaboradores",
      client.employeeCount ||
        "-",
    ],
    [
      "Segmento",
      client.segment ||
        "-",
    ],
  ];

  element(
    "resultClientDetails"
  ).innerHTML =
    details
      .map(
        ([label, value]) => `
          <div class="detail-card">
            <div class="detail-label">
              ${label}
            </div>

            <div class="detail-value">
              ${escapeHtml(value)}
            </div>
          </div>
        `
      )
      .join("") +
    `
      <div class="detail-card wide">
        <div class="detail-label">
          Observações gerais
        </div>

        <div class="detail-value">
          ${escapeHtml(client.clientNotes || "Nenhuma observação informada.")}
        </div>
      </div>
    `;

  const summary =
    result.summary ||
    summarizeAnswers(
      record.answers || {}
    );

  const summaryItems = [
    [
      summary.yes || 0,
      "Sim",
    ],
    [
      summary.partial || 0,
      "Parcialmente",
    ],
    [
      summary.no || 0,
      "Não",
    ],
    [
      (summary.unknown || 0) +
        (summary.unanswered || 0),
      "Pendentes",
    ],
  ];

  element(
    "answerSummary"
  ).innerHTML =
    summaryItems
      .map(
        ([value, label]) => `
          <div class="summary-card">
            <strong>
              ${value}
            </strong>

            <span>
              ${label}
            </span>
          </div>
        `
      )
      .join("");

  element(
    "areaScores"
  ).innerHTML =
    result.scores
      .map(
        (score) => `
          <div class="score-card">
            <span>
              ${escapeHtml(score.name)}
            </span>

            <strong>
              ${score.score}%
            </strong>
          </div>
        `
      )
      .join("");

  if (
    !result.recommendations.length
  ) {
    element(
      "recommendations"
    ).innerHTML =
      '<p class="lead">Nenhuma recomendação crítica foi gerada.</p>';
  } else {
    element(
      "recommendations"
    ).innerHTML =
      result.recommendations
        .map(
          (
            recommendation,
            index
          ) => {
            const severity =
              recommendation.severity ||
              "medium";

            const evidence =
              Array.isArray(
                recommendation.evidence
              )
                ? recommendation.evidence
                : [];

            return `
              <div class="rec">
                <div class="rec-head">
                  <small>
                    Prioridade ${index + 1}
                  </small>

                  <span class="severity severity-${escapeHtml(severity)}">
                    ${escapeHtml(severity)}
                  </span>
                </div>

                <h3>
                  ${escapeHtml(recommendation.title)}
                </h3>

                <p>
                  ${escapeHtml(recommendation.description)}
                </p>

                ${
                  evidence.length
                    ? `
                      <ul class="evidence-list">
                        ${evidence
                          .map(
                            (item) => `
                              <li>
                                <strong>
                                  ${escapeHtml(item.question)}
                                </strong>
                                —
                                ${escapeHtml(answerLabel(item.answer))}
                                ${
                                  item.observation
                                    ? `; observação: ${escapeHtml(item.observation)}`
                                    : ""
                                }
                              </li>
                            `
                          )
                          .join("")}
                      </ul>
                    `
                    : ""
                }
              </div>
            `;
          }
        )
        .join("");
  }
}

function loadRecordIntoState(
  record,
  edit = false
) {
  state = {
    ...emptyState(),

    remoteRecordId:
      record.id,

    sectionIndex: 0,

    client: {
      ...record.client,
    },

    answers:
      structuredClone(
        record.answers || {}
      ),

    lastResult:
      record.result,

    completedAt:
      record.completedAt,
  };

  saveState();

  if (edit) {
    fillClientForm();
    renderSection();
    show("questions");

    setStatus(
      `Editando diagnóstico de ${record.client.companyName || "cliente"}.`,
      "info"
    );
  } else {
    renderStoredResult(
      record
    );

    show("result");
  }

  window.scrollTo(0, 0);
}

function renderHistoryRecords() {
  const list =
    element("historyList");

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        historyState.total /
          historyState.pageSize
      )
    );

  element(
    "historyCount"
  ).textContent =
    `${historyState.total} diagnóstico(s) encontrado(s).`;

  element(
    "historyPageInfo"
  ).textContent =
    `Página ${historyState.page} de ${totalPages}`;

  element(
    "historyPrevPage"
  ).disabled =
    historyState.page <= 1;

  element(
    "historyNextPage"
  ).disabled =
    historyState.page >=
    totalPages;

  element(
    "historyPagination"
  ).classList.toggle(
    "hidden",
    historyState.total === 0
  );

  if (
    !historyState.records.length
  ) {
    list.innerHTML = `
      <div class="empty-state">
        Nenhum diagnóstico encontrado com os filtros selecionados.
      </div>
    `;

    return;
  }

  list.innerHTML =
    historyState.records
      .map(
        (record) => `
          <div class="history-item">
            <div>
              <div class="history-title">
                ${escapeHtml(record.client.companyName || "Cliente")}
              </div>

              <div class="history-meta">
                ${formatDate(record.updatedAt)}
                ·
                ${escapeHtml(record.client.contactName || "Sem contato")}
                ·
                ${escapeHtml(record.result.level.name)}
              </div>
            </div>

            <div>
              <div class="history-score">
                ${record.result.global}%
              </div>

              <div class="history-actions">
                <button
                  class="btn btn-secondary btn-small"
                  data-open-remote="${record.id}"
                >
                  Abrir
                </button>

                <button
                  class="btn btn-secondary btn-small"
                  data-edit-remote="${record.id}"
                >
                  Editar
                </button>

                <button
                  class="btn btn-danger btn-small"
                  data-delete-remote="${record.id}"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        `
      )
      .join("");

  bindHistoryActions();
}

function bindHistoryActions() {
  const findRecord =
    (id) =>
      historyState.records.find(
        (record) =>
          record.id === id
      );

  element("historyList")
    .querySelectorAll(
      "[data-open-remote]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const record =
            findRecord(
              button.dataset.openRemote
            );

          if (record) {
            loadRecordIntoState(
              record,
              false
            );
          }
        }
      );
    });

  element("historyList")
    .querySelectorAll(
      "[data-edit-remote]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const record =
            findRecord(
              button.dataset.editRemote
            );

          if (record) {
            loadRecordIntoState(
              record,
              true
            );
          }
        }
      );
    });

  element("historyList")
    .querySelectorAll(
      "[data-delete-remote]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const record =
            findRecord(
              button.dataset.deleteRemote
            );

          if (!record) {
            return;
          }

          if (
            !confirm(
              `Excluir o diagnóstico de ${record.client.companyName || "este cliente"}?\n\nEssa ação não poderá ser desfeita.`
            )
          ) {
            return;
          }

          button.disabled =
            true;

          button.textContent =
            "Excluindo...";

          try {
            await excluirDiagnostico(
              record.id
            );

            const remainingOnPage =
              historyState.records.length -
              1;

            if (
              remainingOnPage === 0 &&
              historyState.page > 1
            ) {
              historyState.page -= 1;
            }

            await renderHistory();

            setStatus(
              "Diagnóstico excluído do Supabase.",
              "success"
            );
          } catch (error) {
            setStatus(
              error.message ||
                "Não foi possível excluir.",
              "error"
            );

            button.disabled =
              false;

            button.textContent =
              "Excluir";
          }
        }
      );
    });
}

async function renderHistory() {
  element(
    "historyList"
  ).innerHTML = `
    <div class="empty-state">
      Carregando diagnósticos...
    </div>
  `;

  try {
    const response =
      await listarDiagnosticos(
        historyState
      );

    historyState.total =
      response.total;

    historyState.records =
      response.records.map(
        convertSupabaseRecord
      );

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          historyState.total /
            historyState.pageSize
        )
      );

    if (
      historyState.page >
      totalPages
    ) {
      historyState.page =
        totalPages;

      return renderHistory();
    }

    renderHistoryRecords();
  } catch (error) {
    element(
      "historyList"
    ).innerHTML = `
      <div class="warning">
        Não foi possível carregar o histórico.
        <br><br>
        ${escapeHtml(error.message)}
      </div>
    `;

    element(
      "historyPagination"
    ).classList.add(
      "hidden"
    );

    setStatus(
      error.message ||
        "Erro ao carregar histórico.",
      "error"
    );
  }
}

async function generateResult() {
  saveClient();

  const result =
    buildResult();

  const button =
    element("generateBtn");

  const isEditing =
    Boolean(
      state.remoteRecordId
    );

  button.disabled = true;

  button.textContent =
    isEditing
      ? "Atualizando..."
      : "Salvando...";

  setStatus(
    isEditing
      ? "Atualizando diagnóstico..."
      : "Salvando diagnóstico...",
    "info"
  );

  try {
    const saved =
      isEditing
        ? await atualizarDiagnostico({
            id:
              state.remoteRecordId,
            client:
              state.client,
            answers:
              state.answers,
            result,
          })
        : await salvarDiagnostico({
            client:
              state.client,
            answers:
              state.answers,
            result,
          });

    state.remoteRecordId =
      saved.id;

    state.lastResult =
      result;

    state.completedAt =
      saved.created_at ||
      state.completedAt ||
      new Date().toISOString();

    saveState();

    const record =
      convertSupabaseRecord(
        saved
      );

    renderStoredResult(
      record
    );

    show("result");

    setStatus(
      isEditing
        ? "Diagnóstico atualizado no Supabase."
        : "Diagnóstico salvo no Supabase.",
      "success"
    );

    window.scrollTo(0, 0);
  } catch (error) {
    setStatus(
      error.message ||
        "O diagnóstico não foi salvo.",
      "error"
    );

    alert(
      `Não foi possível salvar o diagnóstico.\n\n${error.message}`
    );
  } finally {
    button.disabled = false;
    button.textContent =
      "Gerar diagnóstico";
  }
}

function startNewDiagnostic() {
  if (
    hasSavedProgress() &&
    !confirm(
      "Existe um rascunho salvo. Deseja apagá-lo e iniciar um novo diagnóstico?"
    )
  ) {
    return;
  }

  clearState();
  show("questions");
  renderSection();
  window.scrollTo(0, 0);
}

function continueSavedDiagnostic() {
  loadState();
  fillClientForm();

  const totalQuestions =
    CONFIG.sections.reduce(
      (sum, section) =>
        sum +
        section.questions.length,
      0
    );

  if (
    Object.keys(
      state.answers
    ).length >=
      totalQuestions &&
    state.client.companyName
  ) {
    renderReview();
    show("review");
  } else {
    show("questions");
    renderSection();
  }

  window.scrollTo(0, 0);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const char =
      text[index];

    if (char === '"') {
      if (
        quoted &&
        text[index + 1] === '"'
      ) {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (
      char === "," &&
      !quoted
    ) {
      row.push(field);
      field = "";
    } else if (
      (
        char === "\n" ||
        char === "\r"
      ) &&
      !quoted
    ) {
      if (
        char === "\r" &&
        text[index + 1] === "\n"
      ) {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (
    field ||
    row.length
  ) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function findQuestionByText(
  text
) {
  const normalized =
    normalizeText(text);

  for (
    const section
    of CONFIG.sections
  ) {
    for (
      const question
      of section.questions
    ) {
      if (
        [
          question.text,
          ...(
            question.aliases ||
            []
          ),
        ].some(
          (value) =>
            normalizeText(
              value
            ) === normalized
        )
      ) {
        return question;
      }
    }
  }

  return null;
}

function importRows(rows) {
  clearState();

  let matched = 0;

  for (const row of rows) {
    const first =
      String(
        row[0] || ""
      ).trim();

    const normalized =
      normalizeText(first);

    if (
      normalized ===
      "nome da empresa"
    ) {
      state.client.companyName =
        String(
          row[1] || ""
        ).trim();
    } else if (
      normalized ===
      "contato"
    ) {
      state.client.contactName =
        String(
          row[1] || ""
        ).trim();
    } else if (
      normalized.includes(
        "numero colaboradores"
      )
    ) {
      state.client.employeeCount =
        String(
          row[1] || ""
        ).trim();
    }

    const question =
      findQuestionByText(
        first
      );

    if (!question) {
      continue;
    }

    let value = null;

    if (
      Number(
        String(
          row[1] || ""
        ).replace(",", ".")
      ) === 100
    ) {
      value = "yes";
    } else if (
      Number(
        String(
          row[2] || ""
        ).replace(",", ".")
      ) === 50
    ) {
      value = "partial";
    } else if (
      Number(
        String(
          row[3] || ""
        ).replace(",", ".")
      ) === 0 &&
      String(
        row[3] || ""
      ).trim() !== ""
    ) {
      value = "no";
    } else {
      const result =
        Number(
          String(
            row[4] || ""
          ).replace(",", ".")
        );

      if (result === 100) {
        value = "yes";
      } else if (
        result === 50
      ) {
        value = "partial";
      } else if (
        result === 0
      ) {
        value = "no";
      }
    }

    if (value) {
      state.answers[
        question.id
      ] = {
        value,

        observation:
          String(
            row[5] || ""
          ).trim(),
      };

      matched += 1;
    }
  }

  state.sectionIndex = 0;
  saveState();
  fillClientForm();

  return matched;
}

async function handleCSV(file) {
  const status =
    element("importStatus");

  try {
    status.textContent =
      "Lendo a planilha...";

    const buffer =
      await file.arrayBuffer();

    let content =
      new TextDecoder(
        "utf-8",
        {
          fatal: false,
        }
      ).decode(buffer);

    if (
      (
        content.match(
          /�/g
        ) || []
      ).length > 2
    ) {
      content =
        new TextDecoder(
          "windows-1252"
        ).decode(buffer);
    }

    const matched =
      importRows(
        parseCSV(content)
      );

    if (!matched) {
      throw new Error(
        "Nenhuma das 21 perguntas foi reconhecida. Use o modelo atual da planilha."
      );
    }

    status.textContent =
      `Importação concluída: ${matched} pergunta(s) reconhecida(s).`;

    renderReview();
    show("review");
    window.scrollTo(0, 0);
  } catch (error) {
    status.textContent =
      `Erro: ${error.message}`;

    alert(
      `Não foi possível importar a planilha. ${error.message}`
    );
  }
}

function downloadCurrentJson() {
  const payload = {
    exportedAt:
      new Date().toISOString(),

    diagnostic:
      state,
  };

  const blob =
    new Blob(
      [
        JSON.stringify(
          payload,
          null,
          2
        ),
      ],
      {
        type:
          "application/json",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href = url;

  anchor.download =
    `diagnostico-${(state.client.companyName || "cliente")
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )}.json`;

  anchor.click();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    500
  );
}

function bindEvents() {
  element(
    "startBtn"
  ).addEventListener(
    "click",
    startNewDiagnostic
  );

  element(
    "continueBtn"
  ).addEventListener(
    "click",
    continueSavedDiagnostic
  );

  element(
    "historyBtn"
  ).addEventListener(
    "click",
    async () => {
      historyState.page = 1;

      show("history");
      window.scrollTo(0, 0);

      await renderHistory();
    }
  );

  element(
    "historyBackBtn"
  ).addEventListener(
    "click",
    () => {
      show("home");
      updateContinueButton();
    }
  );

  element(
    "importBtn"
  ).addEventListener(
    "click",
    () =>
      element(
        "csvInput"
      ).click()
  );

  element(
    "csvInput"
  ).addEventListener(
    "change",
    (event) => {
      const file =
        event.target.files[0];

      if (file) {
        handleCSV(file);
      }

      event.target.value =
        "";
    }
  );

  element(
    "prevBtn"
  ).addEventListener(
    "click",
    () => {
      if (
        state.sectionIndex >
        0
      ) {
        state.sectionIndex -= 1;
        saveState();
        renderSection();
        window.scrollTo(0, 0);
      }
    }
  );

  element(
    "nextBtn"
  ).addEventListener(
    "click",
    () => {
      const section =
        CONFIG.sections[
          state.sectionIndex
        ];

      const missing =
        sectionMissing(
          section
        );

      if (
        missing.length &&
        !confirm(
          `Há ${missing.length} pergunta(s) sem resposta. Deseja continuar mesmo assim?`
        )
      ) {
        return;
      }

      if (
        state.sectionIndex <
        CONFIG.sections.length -
          1
      ) {
        state.sectionIndex += 1;
        saveState();
        renderSection();
      } else {
        fillClientForm();
        show("client");
      }

      window.scrollTo(0, 0);
    }
  );

  element(
    "clientBackBtn"
  ).addEventListener(
    "click",
    () => {
      saveClient();

      state.sectionIndex =
        CONFIG.sections.length -
        1;

      saveState();
      show("questions");
      renderSection();
    }
  );

  element(
    "reviewBtn"
  ).addEventListener(
    "click",
    () => {
      saveClient();

      if (
        !state.client.companyName ||
        !state.client.contactName
      ) {
        alert(
          "Preencha o nome da empresa e o nome do contato."
        );

        return;
      }

      renderReview();
      show("review");
      window.scrollTo(0, 0);
    }
  );

  element(
    "reviewBackBtn"
  ).addEventListener(
    "click",
    () => {
      fillClientForm();
      show("client");
    }
  );

  element(
    "generateBtn"
  ).addEventListener(
    "click",
    generateResult
  );

  element(
    "resultHomeBtn"
  ).addEventListener(
    "click",
    () => {
      show("home");
      updateContinueButton();
    }
  );

  element(
    "editResultBtn"
  ).addEventListener(
    "click",
    () => {
      if (
        !state.remoteRecordId
      ) {
        return;
      }

      fillClientForm();
      state.sectionIndex = 0;
      renderSection();
      show("questions");

      setStatus(
        `Editando diagnóstico de ${state.client.companyName || "cliente"}.`,
        "info"
      );
    }
  );

  element(
    "downloadJsonBtn"
  ).addEventListener(
    "click",
    downloadCurrentJson
  );

  element(
    "printBtn"
  ).addEventListener(
    "click",
    () => window.print()
  );

  element(
    "restartBtn"
  ).addEventListener(
    "click",
    () => {
      if (
        !confirm(
          "Deseja iniciar um novo diagnóstico? O resultado atual continuará salvo no histórico."
        )
      ) {
        return;
      }

      clearState();
      show("questions");
      renderSection();
    }
  );

  element(
    "historySearch"
  ).addEventListener(
    "input",
    (event) => {
      clearTimeout(
        historySearchTimer
      );

      historySearchTimer =
        setTimeout(
          async () => {
            historyState.search =
              event.target.value.trim();

            historyState.page = 1;

            await renderHistory();
          },
          300
        );
    }
  );

  element(
    "historyMaturity"
  ).addEventListener(
    "change",
    async (event) => {
      historyState.maturity =
        event.target.value;

      historyState.page = 1;

      await renderHistory();
    }
  );

  element(
    "clearHistoryFiltersBtn"
  ).addEventListener(
    "click",
    async () => {
      element(
        "historySearch"
      ).value = "";

      element(
        "historyMaturity"
      ).value = "";

      historyState.search = "";
      historyState.maturity = "";
      historyState.page = 1;

      await renderHistory();
    }
  );

  element(
    "historyPrevPage"
  ).addEventListener(
    "click",
    async () => {
      if (
        historyState.page <= 1
      ) {
        return;
      }

      historyState.page -= 1;

      await renderHistory();
      window.scrollTo(0, 0);
    }
  );

  element(
    "historyNextPage"
  ).addEventListener(
    "click",
    async () => {
      const totalPages =
        Math.max(
          1,
          Math.ceil(
            historyState.total /
              historyState.pageSize
          )
        );

      if (
        historyState.page >=
        totalPages
      ) {
        return;
      }

      historyState.page += 1;

      await renderHistory();
      window.scrollTo(0, 0);
    }
  );

  window.addEventListener(
    "stmgo:signed-out",
    () => {
      state = emptyState();

      historyState = {
        page: 1,
        pageSize: PAGE_SIZE,
        search: "",
        maturity: "",
        total: 0,
        records: [],
      };
    }
  );
}

loadState();
fillClientForm();
updateContinueButton();
bindEvents();