(function () {
  "use strict";

  /* ---- Approximate on-demand prices (US East, N. Virginia). Edit as needed. ---- */
  var PRICES = {
    hoursPerMonth: 730,
    ec2: {
      "t3.micro":  { label: "t3.micro (2 vCPU, 1 GB)",   perHour: 0.0104 },
      "t3.small":  { label: "t3.small (2 vCPU, 2 GB)",   perHour: 0.0208 },
      "t3.medium": { label: "t3.medium (2 vCPU, 4 GB)",  perHour: 0.0416 },
      "t3.large":  { label: "t3.large (2 vCPU, 8 GB)",   perHour: 0.0832 }
    },
    ebsPerGb: 0.08,          // gp3 per GB-month
    s3PerGb: 0.023,          // S3 Standard per GB-month
    rds: {
      "none":         { label: "No database",                 perHour: 0 },
      "db.t3.micro":  { label: "db.t3.micro (2 vCPU, 1 GB)",  perHour: 0.017 },
      "db.t3.small":  { label: "db.t3.small (2 vCPU, 2 GB)",  perHour: 0.034 },
      "db.t3.medium": { label: "db.t3.medium (2 vCPU, 4 GB)", perHour: 0.068 }
    },
    rdsPerGb: 0.115,         // gp2 storage per GB-month
    albPerMonth: 16.43,      // base hourly charge only
    cloudFrontPerGb: 0.085,
    cloudFrontFreeGb: 1024,  // free tier
    transferPerGb: 0.09,
    transferFreeGb: 100      // free monthly allowance
  };

  var PRESETS = {
    "static": { ec2Type: "t3.micro", ec2Count: 0, ec2Hours: 730, ebsGb: 0, s3Gb: 5, rdsType: "none", rdsGb: 0, albOn: false, cfGb: 50, transferGb: 0 },
    "webapp": { ec2Type: "t3.small", ec2Count: 1, ec2Hours: 730, ebsGb: 30, s3Gb: 20, rdsType: "db.t3.micro", rdsGb: 20, albOn: true, cfGb: 100, transferGb: 20 },
    "busy":   { ec2Type: "t3.medium", ec2Count: 3, ec2Hours: 730, ebsGb: 150, s3Gb: 500, rdsType: "db.t3.medium", rdsGb: 200, albOn: true, cfGb: 2000, transferGb: 300 }
  };

  var DEFAULTS = { ec2Type: "t3.micro", ec2Count: 0, ec2Hours: 730, ebsGb: 0, s3Gb: 0, rdsType: "none", rdsGb: 20, albOn: false, cfGb: 0, transferGb: 0 };

  var $ = function (id) { return document.getElementById(id); };
  var fields = ["ec2Type", "ec2Count", "ec2Hours", "ebsGb", "s3Gb", "rdsType", "rdsGb", "albOn", "cfGb", "transferGb"];

  function money(n) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function num(id, max) {
    var v = parseFloat($(id).value);
    if (isNaN(v) || v < 0) { v = 0; }
    return Math.min(v, max);
  }

  function fillSelect(id, options) {
    var sel = $(id);
    Object.keys(options).forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = options[key].label;
      sel.appendChild(opt);
    });
  }

  function setValues(values) {
    fields.forEach(function (id) {
      var el = $(id);
      if (el.type === "checkbox") { el.checked = values[id]; } else { el.value = values[id]; }
    });
    update();
  }

  function calculate() {
    var ec2Count = num("ec2Count", 100);
    var ec2Hours = num("ec2Hours", PRICES.hoursPerMonth);
    var hasDb = $("rdsType").value !== "none";

    var cfBillable = Math.max(0, num("cfGb", 1000000) - PRICES.cloudFrontFreeGb);
    var transferBillable = Math.max(0, num("transferGb", 1000000) - PRICES.transferFreeGb);

    return [
      { name: "Servers (EC2)",        cost: PRICES.ec2[$("ec2Type").value].perHour * ec2Hours * ec2Count },
      { name: "Disk storage (EBS)",   cost: num("ebsGb", 100000) * PRICES.ebsPerGb },
      { name: "File storage (S3)",    cost: num("s3Gb", 1000000) * PRICES.s3PerGb },
      { name: "Database (RDS)",       cost: PRICES.rds[$("rdsType").value].perHour * PRICES.hoursPerMonth + (hasDb ? num("rdsGb", 100000) * PRICES.rdsPerGb : 0) },
      { name: "Load balancer (ALB)",  cost: $("albOn").checked ? PRICES.albPerMonth : 0 },
      { name: "CloudFront delivery",  cost: cfBillable * PRICES.cloudFrontPerGb },
      { name: "Data transfer out",    cost: transferBillable * PRICES.transferPerGb }
    ];
  }

  var lastSummary = "";

  function update() {
    var items = calculate();
    var total = items.reduce(function (sum, i) { return sum + i.cost; }, 0);
    var list = $("breakdown");
    list.innerHTML = "";

    var visible = items.filter(function (i) { return i.cost > 0; });
    $("emptyMsg").hidden = visible.length > 0;

    visible.forEach(function (item) {
      var pct = total > 0 ? (item.cost / total) * 100 : 0;
      var li = document.createElement("li");

      var line = document.createElement("div");
      line.className = "line";
      var name = document.createElement("span");
      name.textContent = item.name;
      var amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = money(item.cost);
      line.appendChild(name);
      line.appendChild(amount);

      var track = document.createElement("div");
      track.className = "track";
      var fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = pct.toFixed(1) + "%";
      track.appendChild(fill);

      li.appendChild(line);
      li.appendChild(track);
      list.appendChild(li);
    });

    $("total").textContent = money(total);
    $("yearly").textContent = "About " + money(total * 12) + " per year";

    lastSummary = "Estimated AWS cost: " + money(total) + " per month (" + money(total * 12) + " per year)\n" +
      visible.map(function (i) { return "- " + i.name + ": " + money(i.cost); }).join("\n");
  }

  /* Setup */
  fillSelect("ec2Type", PRICES.ec2);
  fillSelect("rdsType", PRICES.rds);
  setValues(DEFAULTS);

  $("estimatorForm").addEventListener("input", update);
  $("estimatorForm").addEventListener("change", update);
  $("estimatorForm").addEventListener("submit", function (e) { e.preventDefault(); });

  document.querySelectorAll("[data-preset]").forEach(function (btn) {
    btn.addEventListener("click", function () { setValues(PRESETS[btn.dataset.preset]); });
  });

  $("resetBtn").addEventListener("click", function () { setValues(DEFAULTS); $("copyStatus").textContent = ""; });

  $("copyBtn").addEventListener("click", function () {
    var status = $("copyStatus");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastSummary).then(
        function () { status.textContent = "Summary copied."; },
        function () { status.textContent = "Could not copy. Select the numbers and copy them by hand."; }
      );
    } else {
      status.textContent = "Copy is not supported in this browser.";
    }
  });

  $("year").textContent = new Date().getFullYear();
})();
