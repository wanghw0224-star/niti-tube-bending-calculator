(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const COLORS = ["#1769aa", "#e07a28", "#29966f", "#8856a7", "#c34f67", "#7b8794", "#b08b21", "#258c9b"];
  let results = [];

  const sampleRows = [
    { name: "规格 A", length: 100, od: 1.0, id: 0.8, e: 40 },
    { name: "规格 B", length: 80, od: 1.0, id: 0.7, e: 40 },
    { name: "规格 C", length: 120, od: 1.2, id: 0.9, e: 40 }
  ];

  function addRow(data = {}) {
    const tr = document.createElement("tr");
    const values = {
      name: data.name ?? `规格 ${$("specRows").children.length + 1}`,
      length: data.length ?? 100,
      od: data.od ?? 1.0,
      id: data.id ?? 0.8,
      e: data.e ?? (Number($("defaultE").value) || 40)
    };
    tr.innerHTML = `
      <td><input class="name-input" data-key="name" aria-label="规格名称" maxlength="40"></td>
      <td><input data-key="length" type="number" min="0.001" step="any" aria-label="长度 mm"></td>
      <td><input data-key="od" type="number" min="0.001" step="any" aria-label="外径 mm"></td>
      <td><input data-key="id" type="number" min="0" step="any" aria-label="内径 mm"></td>
      <td><input data-key="e" type="number" min="0.001" step="any" aria-label="弹性模量 GPa"></td>
      <td><button class="remove-btn" type="button" aria-label="删除该规格">删除</button></td>`;
    Object.entries(values).forEach(([key, value]) => tr.querySelector(`[data-key="${key}"]`).value = value);
    tr.querySelector(".remove-btn").addEventListener("click", () => {
      if ($("specRows").children.length <= 1) {
        setStatus("至少保留一组规格。", true);
        return;
      }
      tr.remove();
      calculate();
    });
    $("specRows").appendChild(tr);
  }

  function readRows() {
    return [...$("specRows").querySelectorAll("tr")].map((tr, index) => {
      const get = key => tr.querySelector(`[data-key="${key}"]`).value.trim();
      return {
        name: get("name") || `规格 ${index + 1}`,
        length: Number(get("length")),
        od: Number(get("od")),
        id: Number(get("id")),
        e: Number(get("e"))
      };
    });
  }

  function validate(row, index) {
    const prefix = `${row.name || `第 ${index + 1} 组`}: `;
    if (![row.length, row.od, row.id, row.e].every(Number.isFinite)) return prefix + "参数必须为有效数字。";
    if (row.length <= 0) return prefix + "长度必须大于 0。";
    if (row.od <= 0) return prefix + "外径必须大于 0。";
    if (row.id < 0) return prefix + "内径不能小于 0。";
    if (row.od <= row.id) return prefix + "外径必须大于内径。";
    if (row.e <= 0) return prefix + "弹性模量必须大于 0。";
    return "";
  }

  function calculate() {
    const rows = readRows();
    if (!rows.length) return setStatus("请至少添加一组规格。", true);
    for (let i = 0; i < rows.length; i++) {
      const error = validate(rows[i], i);
      if (error) {
        results = [];
        renderEmpty();
        return setStatus(error, true);
      }
    }
    results = rows.map(row => {
      const I = Math.PI / 64 * (Math.pow(row.od, 4) - Math.pow(row.id, 4)); // mm^4
      const E_Nmm2 = row.e * 1000; // GPa -> N/mm^2
      const EI_Nmm2 = E_Nmm2 * I; // N*mm^2
      const k_Nmm = 3 * EI_Nmm2 / Math.pow(row.length, 3); // N/mm
      return { ...row, I, EI_Nmm2, EI_Nm2: EI_Nmm2 * 1e-6, k_Nmm };
    });
    renderResults();
    renderComparison();
    drawChart();
    setStatus(`已完成 ${results.length} 组规格计算。`);
  }

  function fmt(value, digits = 6) {
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function esc(value) {
    return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }
  function setStatus(message, isError = false) {
    $("status").textContent = message;
    $("status").style.color = isError ? "#b42318" : "#16794b";
  }
  function renderEmpty() {
    $("resultsBody").innerHTML = '<tr><td colspan="5" class="empty">参数无效，请修正后重新计算。</td></tr>';
    $("comparison").innerHTML = '<p class="empty">暂无有效结果。</p>';
    $("chartLegend").innerHTML = "";
    const canvas = $("lengthChart");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function renderResults() {
    $("resultsBody").innerHTML = results.map(r => `<tr>
      <td>${esc(r.name)}</td><td>${fmt(r.I, 8)}</td><td>${fmt(r.EI_Nmm2, 6)}</td>
      <td>${fmt(r.EI_Nm2, 9)}</td><td>${fmt(r.k_Nmm, 9)}</td></tr>`).join("");
  }
  function renderComparison() {
    const max = Math.max(...results.map(r => r.k_Nmm));
    $("comparison").innerHTML = results.map((r, i) => {
      const pct = max > 0 ? r.k_Nmm / max * 100 : 0;
      return `<article class="compare-card"><h3>${esc(r.name)}</h3>
        <strong>${fmt(r.k_Nmm, 8)}</strong><p>端部刚度 k（N/mm）</p>
        <div class="bar"><span style="width:${pct}%;background:${COLORS[i % COLORS.length]}"></span></div>
        <p>相对最高值：${fmt(pct, 1)}%</p></article>`;
    }).join("");
  }

  function drawChart() {
    const canvas = $("lengthChart");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, Math.floor(rect.width * dpr));
    canvas.height = Math.max(200, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const pad = { left: 68, right: 22, top: 20, bottom: 48 };
    const plotW = w - pad.left - pad.right, plotH = h - pad.top - pad.bottom;
    const minL = Number($("curveMin").value), maxL = Number($("curveMax").value);
    if (!(minL > 0 && maxL > minL) || !results.length) {
      ctx.fillStyle = "#b42318"; ctx.font = "13px sans-serif";
      ctx.fillText("请设置有效的长度范围并先完成计算。", 18, 28);
      return;
    }
    const points = results.map(r => ({ ...r, curve: Array.from({length:100}, (_,i) => {
      const L = minL + (maxL - minL) * i / 99;
      return { L, k: 3 * r.EI_Nmm2 / Math.pow(L,3) };
    })}));
    const allY = points.flatMap(p => p.curve.map(v => v.k));
    let yMin = Math.min(...allY), yMax = Math.max(...allY);
    if (yMin === yMax) yMax = yMin + 1;
    const logMin = Math.log10(yMin), logMax = Math.log10(yMax);
    const x = L => pad.left + (L - minL) / (maxL - minL) * plotW;
    const y = K => pad.top + (logMax - Math.log10(K)) / (logMax - logMin) * plotH;

    ctx.strokeStyle = "#e7edf3"; ctx.lineWidth = 1; ctx.fillStyle = "#718096";
    ctx.font = "11px sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i=0;i<=4;i++) {
      const yy = pad.top + plotH*i/4;
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(w-pad.right, yy); ctx.stroke();
      const val = Math.pow(10, logMax - (logMax-logMin)*i/4);
      ctx.fillText(Number(val.toPrecision(3)).toString(), pad.left-9, yy);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let i=0;i<=5;i++) {
      const L = minL + (maxL-minL)*i/5, xx=x(L);
      ctx.beginPath();ctx.moveTo(xx,pad.top);ctx.lineTo(xx,pad.top+plotH);ctx.stroke();
      ctx.fillText(fmt(L,1),xx,pad.top+plotH+9);
    }
    ctx.fillStyle="#42536a";ctx.font="12px sans-serif";
    ctx.fillText("长度 L（mm）",pad.left+plotW/2,h-17);
    ctx.save();ctx.translate(15,pad.top+plotH/2);ctx.rotate(-Math.PI/2);ctx.fillText("端部刚度 k（N/mm，对数刻度）",0,0);ctx.restore();

    points.forEach((p,i) => {
      ctx.strokeStyle=COLORS[i%COLORS.length];ctx.lineWidth=2.4;ctx.beginPath();
      p.curve.forEach((v,j)=>j?ctx.lineTo(x(v.L),y(v.k)):ctx.moveTo(x(v.L),y(v.k)));
      ctx.stroke();
      const current = 3*p.EI_Nmm2/Math.pow(p.length,3);
      if (p.length>=minL && p.length<=maxL) {
        ctx.fillStyle=COLORS[i%COLORS.length];ctx.beginPath();ctx.arc(x(p.length),y(current),4,0,Math.PI*2);ctx.fill();
      }
    });
    $("chartLegend").innerHTML = points.map((p,i)=>`<span><i style="background:${COLORS[i%COLORS.length]}"></i>${esc(p.name)}（当前 L=${fmt(p.length,2)} mm）</span>`).join("");
  }

  function reportText() {
    const now = new Date().toLocaleString("zh-CN");
    const lines = [
      "镍钛管弯曲刚度计算报告",
      `生成时间：${now}`,
      "",
      "模型与公式：",
      "I = π/64 × (OD⁴ − ID⁴)",
      "EI = E × I",
      "k = 3EI/L³（悬臂梁自由端横向集中载荷模型）",
      "单位：尺寸 mm；E GPa；I mm⁴；EI N·mm²；k N/mm。",
      "",
      "计算结果：",
      "名称,长度L(mm),外径OD(mm),内径ID(mm),弹性模量E(GPa),I(mm^4),EI(N·mm^2),EI(N·m^2),k(N/mm)"
    ];
    results.forEach(r => lines.push([
      r.name,r.length,r.od,r.id,r.e,r.I,r.EI_Nmm2,r.EI_Nm2,r.k_Nmm
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")));
    lines.push("", "模型假设与限制：", "1. 均匀空心圆截面梁，材料按线弹性处理。", "2. k 采用理想悬臂梁自由端横向集中力边界条件。", "3. 镍钛合金的超弹性、相变、温度依赖、加载历史及非线性未纳入。", "4. 结果仅供工程初步估算，需结合实际材料数据与测试验证。");
    return lines.join("\n");
  }

  function download(filename, content, mime) {
    const blob = new Blob(["\uFEFF", content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  $("addRowBtn").addEventListener("click", () => addRow());
  $("calculateBtn").addEventListener("click", calculate);
  $("resetBtn").addEventListener("click", () => {
    $("specRows").innerHTML = "";
    sampleRows.forEach(addRow);
    $("defaultE").value = 40; $("preset").value = "40";
    $("curveMin").value = 10; $("curveMax").value = 150;
    calculate();
  });
  $("preset").addEventListener("change", e => {
    if (e.target.value !== "custom") {
      $("defaultE").value = e.target.value;
      $("specRows").querySelectorAll('[data-key="e"]').forEach(input => input.value = e.target.value);
      calculate();
    }
  });
  $("defaultE").addEventListener("change", () => {
    const value = Number($("defaultE").value);
    if (value > 0) {
      $("specRows").querySelectorAll('[data-key="e"]').forEach(input => input.value = value);
      $("preset").value = "custom";
      calculate();
    }
  });
  $("curveMin").addEventListener("change", drawChart);
  $("curveMax").addEventListener("change", drawChart);
  $("csvBtn").addEventListener("click", () => {
    if (!results.length) return setStatus("请先计算有效结果。", true);
    const header = ["规格名称","长度L(mm)","外径OD(mm)","内径ID(mm)","弹性模量E(GPa)","截面惯性矩I(mm^4)","EI(N·mm^2)","EI(N·m^2)","悬臂梁端部刚度k(N/mm)"];
    const quote = value => `"${String(value).replace(/"/g, '""')}"`;
    const csv = [header.map(quote).join(","), ...results.map(r => [r.name,r.length,r.od,r.id,r.e,r.I,r.EI_Nmm2,r.EI_Nm2,r.k_Nmm].map(quote).join(","))].join("\r\n");
    download("NiTi_tube_bending_stiffness_report.csv", csv, "text/csv;charset=utf-8");
  });
  $("printBtn").addEventListener("click", () => {
    if (!results.length) return setStatus("请先计算有效结果。", true);
    window.print();
  });
  window.addEventListener("resize", () => { if (results.length) drawChart(); });

  sampleRows.forEach(addRow);
  calculate();
})();