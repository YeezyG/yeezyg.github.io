(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TTrade = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Money is integer fen (0.01 yuan). Prices are integer "tiny" units (0.0001 yuan).
  // Fees round half up to the fen. Commission below the minimum is raised to the minimum, once per order.
  var KINDS = [
    {
      id: "stock",
      name: "股票",
      mode: "trade",
      currency: "元",
      qtyUnit: "股",
      lot: 100,
      tickTiny: 100,
      commission: { numer: 85, denom: 1000000, minFen: 200 },
      transfer: { numer: 1, denom: 100000 },
      stamp: { numer: 5, denom: 10000 },
      rateNote: "佣金万0.85，买卖都收，每笔最低 2 元。过户费万0.1，买卖都收。印花税只在卖出时收，万5。",
      commissionText: "万0.85，最低 2 元/笔",
      extraText: "过户费万0.1，双边；印花税卖出万5",
      example: { buyPrice: "10.00", buyQty: "1000", sellPrice: "10.05", sellQty: "" }
    },
    {
      id: "etf",
      name: "ETF",
      mode: "trade",
      currency: "元",
      qtyUnit: "份",
      lot: 100,
      tickTiny: 10,
      commission: { numer: 60, denom: 1000000, minFen: 20 },
      rateNote: "佣金万0.6，买卖都收，每笔最低 0.2 元。ETF 没有过户费，也没有印花税。",
      commissionText: "万0.6，最低 0.2 元/笔",
      extraText: "无过户费，无印花税",
      example: { buyPrice: "1.000", buyQty: "100", sellPrice: "", sellQty: "" }
    },
    {
      id: "cb_sh",
      name: "可转债 · 沪",
      mode: "trade",
      currency: "元",
      qtyUnit: "张",
      lot: 10,
      tickTiny: 10,
      commission: { numer: 44, denom: 1000000, minFen: 0 },
      rateNote: "沪市可转债佣金万0.44，买卖都收，没有最低收费。没有过户费和印花税。",
      commissionText: "万0.44，无最低",
      extraText: "无过户费，无印花税",
      example: { buyPrice: "120.000", buyQty: "100", sellPrice: "120.500", sellQty: "" }
    },
    {
      id: "cb_sz",
      name: "可转债 · 深",
      mode: "trade",
      currency: "元",
      qtyUnit: "张",
      lot: 10,
      tickTiny: 10,
      commission: { numer: 80, denom: 1000000, minFen: 0 },
      rateNote: "深市可转债佣金万0.8，买卖都收，没有最低收费。没有过户费和印花税。",
      commissionText: "万0.8，无最低",
      extraText: "无过户费，无印花税",
      example: { buyPrice: "120.000", buyQty: "100", sellPrice: "120.500", sellQty: "" }
    },
    {
      id: "bse",
      name: "北交所",
      mode: "trade",
      currency: "元",
      qtyUnit: "股",
      lot: 100,
      tickTiny: 100,
      commission: { numer: 800, denom: 1000000, minFen: 0 },
      transfer: { numer: 1, denom: 100000 },
      stamp: { numer: 5, denom: 10000 },
      rateNote: "佣金万8，买卖都收，没有最低收费。过户费万0.1，买卖都收。印花税只在卖出时收，万5。",
      commissionText: "万8，无最低",
      extraText: "过户费万0.1，双边；印花税卖出万5",
      example: { buyPrice: "10.00", buyQty: "100", sellPrice: "10.20", sellQty: "" }
    },
    {
      id: "hk",
      name: "港股通",
      mode: "trade",
      currency: "港元",
      qtyUnit: "股",
      lot: 0,
      tickTiny: 100,
      commission: { numer: 120, denom: 1000000, minFen: 0 },
      rateNote: "佣金万1.2，买卖都收，没有最低收费。港股通印花税、交易征费和结算费这里没有算。",
      commissionText: "万1.2，无最低",
      extraText: "只算佣金，不含印花税和其他规费",
      example: { buyPrice: "50.00", buyQty: "1000", sellPrice: "50.50", sellQty: "" }
    },
    {
      id: "margin",
      name: "两融",
      mode: "trade",
      currency: "元",
      qtyUnit: "股",
      lot: 100,
      tickTiny: 100,
      interest: true,
      commission: { numer: 85, denom: 1000000, minFen: 200 },
      transfer: { numer: 1, denom: 100000 },
      stamp: { numer: 5, denom: 10000 },
      rateNote: "佣金、过户费、印花税与股票相同。融资利息按买入金额 × 4.5% / 360 × 天数，当天来回填 1 天。",
      commissionText: "同股票，万0.85，最低 2 元/笔",
      extraText: "另加融资利息，年化 4.5%，按 360 天",
      example: { buyPrice: "10.00", buyQty: "1000", sellPrice: "10.05", sellQty: "", days: "1" }
    },
    {
      id: "repo",
      name: "国债逆回购",
      mode: "repo",
      currency: "元",
      commission: { numer: 10, denom: 1000000, minFen: 0 },
      rateNote: "佣金万0.1，按回购金额收一次，没有最低收费。利息按金额 × 年化 × 占款天数 / 365。",
      commissionText: "万0.1，收一次，无最低",
      extraText: "利息按 365 天计，没有印花税和过户费",
      example: { amount: "100000", rate: "2", days: "1" }
    }
  ];

  var BY_ID = {};
  KINDS.forEach(function (kind) {
    BY_ID[kind.id] = kind;
  });

  function divRound(numer, denom) {
    var n = BigInt(numer);
    var d = BigInt(denom);
    if (d === 0n) {
      return null;
    }
    var v = (n >= 0n ? n + d / 2n : n - d / 2n) / d;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return Number(v);
  }

  function amountFen(priceTiny, qty) {
    var tiny = BigInt(priceTiny) * BigInt(qty);
    var fen = (tiny + 50n) / 100n;
    if (fen > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return Number(fen);
  }

  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  function group(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatYuan(fen) {
    var v = Math.abs(fen);
    var whole = Math.floor(v / 100);
    var cents = v % 100;
    return group(whole) + "." + String(cents).padStart(2, "0");
  }

  function formatSigned(fen) {
    if (fen > 0) {
      return "+" + formatYuan(fen);
    }
    if (fen < 0) {
      return "−" + formatYuan(fen);
    }
    return formatYuan(0);
  }

  function formatPriceTiny(tiny) {
    var v = Math.abs(tiny);
    var whole = Math.floor(v / 10000);
    var frac = String(v % 10000).padStart(4, "0").replace(/0+$/, "");
    if (frac.length < 2) {
      frac = frac.padEnd(2, "0");
    }
    return (tiny < 0 ? "−" : "") + group(whole) + "." + frac;
  }

  function formatQty(qty) {
    return group(qty);
  }

  function formatRatio(part, whole) {
    var hundredths = divRound(BigInt(part) * 10000n, BigInt(whole));
    if (hundredths === null) {
      return "";
    }
    var v = Math.abs(hundredths);
    return (hundredths < 0 ? "−" : "") + group(Math.floor(v / 100)) + "." + String(v % 100).padStart(2, "0") + "%";
  }

  function priceMove(rule, fromTiny, toTiny) {
    var delta = toTiny - fromTiny;
    var abs = Math.abs(delta);
    var amount = formatPriceTiny(abs);
    var ratio = abs === 0 || !fromTiny ? "0.00%" : formatRatio(abs, fromTiny);
    var sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
    var word = delta > 0 ? "涨" : delta < 0 ? "跌" : "平";
    return {
      dir: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      amountText: sign + amount + " " + rule.currency,
      ratioText: (sign || "") + ratio,
      phrase: word + " " + amount + " " + rule.currency + "，" + (sign || "") + ratio
    };
  }

  function formatPercent(units) {
    var whole = Math.floor(units / 10000);
    var frac = String(units % 10000).padStart(4, "0").replace(/0+$/, "");
    if (frac.length < 2) {
      frac = frac.padEnd(2, "0");
    }
    return group(whole) + "." + frac + "%";
  }

  function parseScaled(text, scaleDigits, label) {
    var s = String(text).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) {
      return { ok: false, message: label + "要是大于 0 的数字" };
    }
    var parts = s.split(".");
    var frac = parts[1] || "";
    if (frac.length > scaleDigits) {
      return { ok: false, message: label + "最多 " + scaleDigits + " 位小数" };
    }
    var digits = parts[0] + frac.padEnd(scaleDigits, "0");
    var bi = BigInt(digits);
    if (bi <= 0n) {
      return { ok: false, message: label + "要大于 0" };
    }
    if (bi > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { ok: false, message: label + "太大了" };
    }
    return { ok: true, value: Number(bi) };
  }

  function parseQty(text) {
    var s = String(text).trim();
    if (!/^\d+$/.test(s)) {
      return { ok: false, message: "数量要是正整数" };
    }
    var bi = BigInt(s);
    if (bi <= 0n) {
      return { ok: false, message: "数量要大于 0" };
    }
    if (bi > 1000000000000n) {
      return { ok: false, message: "数量太大了" };
    }
    return { ok: true, value: Number(bi) };
  }

  function parseDays(text, blankMessage) {
    if (isBlank(text)) {
      return { ok: false, message: blankMessage };
    }
    var s = String(text).trim();
    if (!/^\d+$/.test(s)) {
      return { ok: false, message: "天数要是正整数" };
    }
    var n = Number(s);
    if (n <= 0) {
      return { ok: false, message: "天数要大于 0" };
    }
    if (n > 3650) {
      return { ok: false, message: "天数太大了" };
    }
    return { ok: true, value: n };
  }

  function charge(amount, spec) {
    if (!spec) {
      return { fen: 0, hitMin: false };
    }
    var raw = divRound(BigInt(amount) * BigInt(spec.numer), spec.denom);
    if (raw === null) {
      return null;
    }
    var minFen = spec.minFen || 0;
    if (raw < minFen) {
      return { fen: minFen, hitMin: true };
    }
    return { fen: raw, hitMin: false };
  }

  function baseResult(rule) {
    return {
      status: "empty",
      mode: rule.mode,
      tone: "muted",
      kicker: "做T盈亏",
      value: "—",
      unit: "",
      judge: "",
      sub: "",
      rows: [],
      notes: [],
      caption: "",
      rateNote: rule.rateNote
    };
  }

  function fail(rule, message) {
    var result = baseResult(rule);
    result.status = "error";
    result.judge = message;
    result.message = message;
    return result;
  }

  function tooBig(rule) {
    return fail(rule, "金额太大了，算不了");
  }

  function buyLeg(rule, priceTiny, qty, days, chargeInterest) {
    var gross = amountFen(priceTiny, qty);
    if (gross === null) {
      return null;
    }
    var comm = charge(gross, rule.commission);
    var transfer = charge(gross, rule.transfer);
    if (!comm || !transfer) {
      return null;
    }
    var interest = 0;
    if (rule.interest && chargeInterest !== false) {
      interest = divRound(BigInt(gross) * 45n * BigInt(days), 360000);
      if (interest === null) {
        return null;
      }
    }
    return {
      amountFen: gross,
      commFen: comm.fen,
      commHitMin: comm.hitMin,
      transferFen: transfer.fen,
      interestFen: interest
    };
  }

  function sellLeg(rule, priceTiny, qty, days, chargeInterest) {
    var gross = amountFen(priceTiny, qty);
    if (gross === null) {
      return null;
    }
    var comm = charge(gross, rule.commission);
    var transfer = charge(gross, rule.transfer);
    var stamp = charge(gross, rule.stamp);
    if (!comm || !transfer || !stamp) {
      return null;
    }
    var interest = 0;
    if (rule.interest && chargeInterest) {
      interest = divRound(BigInt(gross) * 45n * BigInt(days), 360000);
      if (interest === null) {
        return null;
      }
    }
    return {
      amountFen: gross,
      commFen: comm.fen,
      commHitMin: comm.hitMin,
      transferFen: transfer.fen,
      stampFen: stamp.fen,
      interestFen: interest
    };
  }

  function settle(rule, buy, sell) {
    var feeFen = buy.commFen + buy.transferFen + (buy.interestFen || 0) + sell.commFen + sell.transferFen + sell.stampFen + (sell.interestFen || 0);
    var grossFen = sell.amountFen - buy.amountFen;
    return {
      buy: buy,
      sell: sell,
      feeFen: feeFen,
      grossFen: grossFen,
      netFen: grossFen - feeFen
    };
  }

  function estimateTiny(rule, buy, sellQty) {
    var outflow = buy.amountFen + buy.commFen + buy.transferFen + buy.interestFen;
    var rc = rule.commission.numer / rule.commission.denom;
    var rt = rule.transfer ? rule.transfer.numer / rule.transfer.denom : 0;
    var rs = rule.stamp ? rule.stamp.numer / rule.stamp.denom : 0;
    var minFen = rule.commission.minFen || 0;
    var propDenom = 1 - rc - rt - rs;
    var minDenom = 1 - rt - rs;
    if (propDenom <= 0.01 || minDenom <= 0.01) {
      return rule.tickTiny;
    }
    var sProp = outflow / propDenom;
    var sMin = (outflow + minFen) / minDenom;
    var sFen = sProp * rc >= minFen ? sProp : sMin;
    var tiny = Math.ceil((sFen * 100) / sellQty);
    if (!isFinite(tiny) || tiny < 1) {
      return rule.tickTiny;
    }
    return tiny;
  }

  function findBreakeven(rule, buyPriceTiny, buyQty, sellQty, days) {
    var buy = buyLeg(rule, buyPriceTiny, buyQty, days);
    if (!buy) {
      return null;
    }
    var tick = rule.tickTiny;
    var guess = estimateTiny(rule, buy, sellQty);
    guess = Math.ceil(guess / tick) * tick;
    if (guess < tick) {
      guess = tick;
    }

    function at(priceTiny) {
      var sell = sellLeg(rule, priceTiny, sellQty);
      if (!sell) {
        return null;
      }
      return settle(rule, buy, sell);
    }

    var steps = 0;
    var probe = at(guess);
    if (!probe) {
      return null;
    }
    while (probe.netFen < 0) {
      guess += tick;
      probe = at(guess);
      if (!probe || ++steps > 200000) {
        return null;
      }
    }
    while (guess > tick) {
      var lower = at(guess - tick);
      if (!lower || lower.netFen < 0) {
        break;
      }
      guess -= tick;
      probe = lower;
      if (++steps > 200000) {
        break;
      }
    }

    var exact = guess;
    var floor = Math.max(1, guess - tick);
    while (exact > floor) {
      var prev = at(exact - 1);
      if (!prev || prev.netFen < 0) {
        break;
      }
      exact -= 1;
    }

    var prevTick = guess - tick;
    var prevNet = null;
    if (prevTick > 0) {
      var prevSettle = at(prevTick);
      prevNet = prevSettle ? prevSettle.netFen : null;
    }

    return {
      quotedTiny: guess,
      exactTiny: exact,
      netAtQuotedFen: probe.netFen,
      prevTickTiny: prevTick > 0 ? prevTick : null,
      prevNetFen: prevNet,
      settled: probe
    };
  }

  function moneyRow(label, fen, signed, currency) {
    return {
      label: label,
      value: (signed ? formatSigned(fen) : formatYuan(fen)) + " " + currency
    };
  }

  function tradeNotes(rule, buyQty, sellQty, sellQtyAssumed, settled, breakeven) {
    var notes = [];
    var minFen = rule.commission.minFen || 0;
    var buyHit = settled.buy.commHitMin;
    var sellHit = settled.sell.commHitMin;
    if (minFen > 0 && (buyHit || sellHit)) {
      var who = buyHit && sellHit ? "买入和卖出的" : buyHit ? "买入" : "卖出";
      notes.push(who + "佣金按最低 " + formatYuan(minFen) + " 元收取。");
    }
    if (!sellQtyAssumed && buyQty !== sellQty) {
      var diff = buyQty - sellQty;
      if (diff > 0) {
        notes.push("买入比卖出多 " + formatQty(diff) + " " + rule.qtyUnit + "。盈亏是两笔成交的现金差，多出来的仓位还在。");
      } else {
        notes.push("卖出比买入多 " + formatQty(-diff) + " " + rule.qtyUnit + "。盈亏是两笔成交的现金差。");
      }
    }
    if (rule.lot && (buyQty % rule.lot !== 0 || sellQty % rule.lot !== 0)) {
      notes.push("申报数量一般是 " + rule.lot + " " + rule.qtyUnit + " 的整数倍，这里仍按你填的数量算。");
    }
    if (breakeven && breakeven.exactTiny !== breakeven.quotedTiny) {
      notes.push(
        "精确保本价是 " + formatPriceTiny(breakeven.exactTiny) +
        " " + rule.currency + "，价位是 " + formatPriceTiny(rule.tickTiny) +
        " " + rule.currency + "，所以报到 " + formatPriceTiny(breakeven.quotedTiny) +
        " " + rule.currency + "。"
      );
    }
    if (rule.id === "margin") {
      if (settled.interestOn === "sell") {
        notes.push("利息按融券卖出金额计算。这笔如果没用融券，品种选股票。");
      } else {
        notes.push("利息按融资买入金额计算。这笔如果没用融资，品种选股票。");
      }
    }
    return notes;
  }

  function tradeRows(rule, settled) {
    var unit = rule.currency;
    var rows = [
      moneyRow("买入金额", settled.buy.amountFen, false, unit),
      moneyRow("卖出金额", settled.sell.amountFen, false, unit),
      moneyRow("价差", settled.grossFen, true, unit),
      moneyRow("买入佣金", settled.buy.commFen, false, unit),
      moneyRow("卖出佣金", settled.sell.commFen, false, unit)
    ];
    if (rule.transfer) {
      rows.push(moneyRow("买入过户费", settled.buy.transferFen, false, unit));
      rows.push(moneyRow("卖出过户费", settled.sell.transferFen, false, unit));
    }
    if (rule.stamp) {
      rows.push(moneyRow("印花税", settled.sell.stampFen, false, unit));
    }
    if (rule.interest) {
      if (settled.interestOn === "sell") {
        rows.push(moneyRow("融券利息", settled.sell.interestFen || 0, false, unit));
      } else {
        rows.push(moneyRow("融资利息", settled.buy.interestFen || 0, false, unit));
      }
    }
    var total = moneyRow("费用合计", settled.feeFen, false, unit);
    total.strong = true;
    rows.push(total);
    var net = moneyRow("净盈亏", settled.netFen, true, unit);
    net.strong = true;
    rows.push(net);
    return rows;
  }

  function toneOf(netFen) {
    if (netFen > 0) {
      return "profit";
    }
    if (netFen < 0) {
      return "loss";
    }
    return "flat";
  }

  function judgeOf(netFen) {
    if (netFen > 0) {
      return "赚了";
    }
    if (netFen < 0) {
      return "亏了";
    }
    return "持平";
  }

  function quoteTrade(rule, input) {
    var buyPriceBlank = isBlank(input.buyPrice);
    var buyQtyBlank = isBlank(input.buyQty);
    var sellPriceBlank = isBlank(input.sellPrice);
    var sellQtyBlank = isBlank(input.sellQty);

    if (buyPriceBlank && buyQtyBlank && sellPriceBlank && sellQtyBlank) {
      var empty = baseResult(rule);
      empty.judge = "先填买点";
      empty.sub = "填入买入价格和数量，算出保本卖出价，卖出数量按买入数量。再填卖出价，就知道这笔赚还是亏。";
      return empty;
    }

    if (buyPriceBlank) {
      var needPrice = baseResult(rule);
      needPrice.status = "need";
      needPrice.judge = "还要填买入价格";
      return needPrice;
    }
    if (buyQtyBlank) {
      var needQty = baseResult(rule);
      needQty.status = "need";
      needQty.judge = "还要填买入数量";
      return needQty;
    }

    var buyPrice = parseScaled(input.buyPrice, 4, "买入价格");
    if (!buyPrice.ok) {
      return fail(rule, buyPrice.message);
    }
    var buyQty = parseQty(input.buyQty);
    if (!buyQty.ok) {
      return fail(rule, buyQty.message);
    }

    var sellQtyAssumed = sellQtyBlank;
    var sellQty = buyQty;
    if (!sellQtyBlank) {
      sellQty = parseQty(input.sellQty);
      if (!sellQty.ok) {
        return fail(rule, sellQty.message);
      }
    }

    var days = { ok: true, value: 1 };
    if (rule.interest) {
      days = parseDays(isBlank(input.days) ? "1" : input.days, "还要填计息天数");
      if (!days.ok) {
        return fail(rule, days.message);
      }
    }

    var breakeven = findBreakeven(rule, buyPrice.value, buyQty.value, sellQty.value, days.value);
    if (!breakeven) {
      return tooBig(rule);
    }

    if (sellPriceBlank) {
      var preview = breakeven.settled;
      var result = baseResult(rule);
      result.status = "ok";
      result.tone = "flat";
      result.kicker = "保本卖出";
      result.value = formatPriceTiny(breakeven.quotedTiny);
      result.unit = rule.currency;
      result.move = priceMove(rule, buyPrice.value, breakeven.quotedTiny);
      result.judge = "卖出 " + formatQty(sellQty.value) + " " + rule.qtyUnit;
      if (preview.netFen === 0) {
        result.sub = "卖到这个价格，扣完费用刚好打平。";
      } else {
        result.sub = "报到这个价位，扣完费用净赚 " + formatYuan(preview.netFen) + " " + rule.currency + "。";
      }
      if (breakeven.prevNetFen !== null && breakeven.prevNetFen < 0) {
        result.sub += "低一个价位 " + formatPriceTiny(breakeven.prevTickTiny) + " " + rule.currency + "会亏 " + formatYuan(breakeven.prevNetFen) + " " + rule.currency + "。";
      }
      result.caption = "下面按卖出价 " + formatPriceTiny(breakeven.quotedTiny) + " " + rule.currency + " 试算。";
      result.rows = tradeRows(rule, preview);
      result.notes = tradeNotes(rule, buyQty.value, sellQty.value, sellQtyAssumed, preview, breakeven);
      result.netFen = preview.netFen;
      result.breakeven = breakeven;
      result.sellQty = sellQty.value;
      return result;
    }

    var sellPrice = parseScaled(input.sellPrice, 4, "卖出价格");
    if (!sellPrice.ok) {
      return fail(rule, sellPrice.message);
    }
    var buy = buyLeg(rule, buyPrice.value, buyQty.value, days.value);
    var sell = sellLeg(rule, sellPrice.value, sellQty.value);
    if (!buy || !sell) {
      return tooBig(rule);
    }
    var settled = settle(rule, buy, sell);
    var done = baseResult(rule);
    done.status = "ok";
    done.tone = toneOf(settled.netFen);
    done.kicker = "扣费后";
    done.value = formatSigned(settled.netFen);
    done.unit = rule.currency;
    done.judge = judgeOf(settled.netFen);
    done.sub = "卖出 " + formatQty(sellQty.value) + " " + rule.qtyUnit + "。保本卖出价 " + formatPriceTiny(breakeven.quotedTiny) + " " + rule.currency + "，" + priceMove(rule, buyPrice.value, breakeven.quotedTiny).phrase + "。";
    if (sellQtyAssumed) {
      done.notes = ["卖出数量没填，按买入的 " + formatQty(buyQty.value) + " " + rule.qtyUnit + " 计算。"];
    } else {
      done.notes = [];
    }
    done.notes = done.notes.concat(tradeNotes(rule, buyQty.value, sellQty.value, sellQtyAssumed, settled, breakeven));
    done.rows = tradeRows(rule, settled);
    done.netFen = settled.netFen;
    done.breakeven = breakeven;
    done.sellQty = sellQty.value;
    return done;
  }

  function estimateBuyTiny(rule, sell, buyQty) {
    var inflow = sell.amountFen - sell.commFen - sell.transferFen - sell.stampFen - (sell.interestFen || 0);
    var rc = rule.commission.numer / rule.commission.denom;
    var rt = rule.transfer ? rule.transfer.numer / rule.transfer.denom : 0;
    var minFen = rule.commission.minFen || 0;
    var propDenom = 1 + rc + rt;
    var minDenom = 1 + rt;
    if (inflow <= 0 || propDenom <= 0) {
      return rule.tickTiny;
    }
    var bProp = inflow / propDenom;
    var bMin = (inflow - minFen) / minDenom;
    var bFen = bProp * rc >= minFen ? bProp : bMin;
    var tiny = Math.floor((bFen * 100) / buyQty);
    if (!isFinite(tiny) || tiny < 1) {
      return rule.tickTiny;
    }
    return tiny;
  }

  function findBuyback(rule, sellPriceTiny, sellQty, buyQty, days) {
    var sell = sellLeg(rule, sellPriceTiny, sellQty, days, true);
    if (!sell) {
      return null;
    }
    var tick = rule.tickTiny;
    var guess = estimateBuyTiny(rule, sell, buyQty);
    guess = Math.floor(guess / tick) * tick;
    if (guess < tick) {
      guess = tick;
    }

    function at(priceTiny) {
      var buy = buyLeg(rule, priceTiny, buyQty, days, false);
      if (!buy) {
        return null;
      }
      return settle(rule, buy, sell);
    }

    var steps = 0;
    var probe = at(guess);
    if (!probe) {
      return null;
    }
    while (probe.netFen < 0 && guess > tick) {
      guess -= tick;
      probe = at(guess);
      steps += 1;
      if (!probe || steps > 200000) {
        return null;
      }
    }
    if (probe.netFen < 0) {
      return {
        impossible: true,
        quotedTiny: null,
        exactTiny: null,
        netAtQuotedFen: probe.netFen,
        worseTickTiny: null,
        worseNetFen: null,
        settled: probe
      };
    }
    while (steps <= 200000) {
      var higher = at(guess + tick);
      if (!higher) {
        return null;
      }
      if (higher.netFen < 0) {
        break;
      }
      guess += tick;
      probe = higher;
      steps += 1;
    }
    if (steps > 200000) {
      return null;
    }

    var exact = guess;
    var ceil = guess + tick - 1;
    while (exact < ceil && steps <= 200000) {
      var next = at(exact + 1);
      if (!next || next.netFen < 0) {
        break;
      }
      exact += 1;
      steps += 1;
    }

    var worse = at(guess + tick);
    return {
      impossible: false,
      quotedTiny: guess,
      exactTiny: exact,
      netAtQuotedFen: probe.netFen,
      worseTickTiny: guess + tick,
      worseNetFen: worse ? worse.netFen : null,
      settled: probe
    };
  }

  function dropSentence(rule, sellTiny, buyTiny) {
    var drop = sellTiny - buyTiny;
    if (drop > 0) {
      return "要从 " + formatPriceTiny(sellTiny) + " " + rule.currency +
        " 跌 " + formatPriceTiny(drop) + " " + rule.currency +
        "，大约 " + formatRatio(drop, sellTiny) + "。";
    }
    if (drop === 0) {
      return "买回价和卖出价相同就能保本。";
    }
    return "买回价可以比卖出价高 " + formatPriceTiny(-drop) + " " + rule.currency + " 仍保本。";
  }

  function quoteShort(rule, input) {
    var buyPriceBlank = isBlank(input.buyPrice);
    var buyQtyBlank = isBlank(input.buyQty);
    var sellPriceBlank = isBlank(input.sellPrice);
    var sellQtyBlank = isBlank(input.sellQty);

    if (buyPriceBlank && buyQtyBlank && sellPriceBlank && sellQtyBlank) {
      var empty = baseResult(rule);
      empty.judge = "先填卖点";
      empty.sub = "填入卖出价格和数量，算出要跌多少、买回多少才保本。买入数量按卖出数量。再填买回价，就知道这笔赚还是亏。";
      return empty;
    }
    if (sellPriceBlank) {
      var needPrice = baseResult(rule);
      needPrice.status = "need";
      needPrice.judge = "还要填卖出价格";
      return needPrice;
    }
    if (sellQtyBlank) {
      var needQty = baseResult(rule);
      needQty.status = "need";
      needQty.judge = "还要填卖出数量";
      return needQty;
    }

    var sellPrice = parseScaled(input.sellPrice, 4, "卖出价格");
    if (!sellPrice.ok) {
      return fail(rule, sellPrice.message);
    }
    var sellQty = parseQty(input.sellQty);
    if (!sellQty.ok) {
      return fail(rule, sellQty.message);
    }

    var buyQtyAssumed = buyQtyBlank;
    var buyQty = sellQty;
    if (!buyQtyBlank) {
      buyQty = parseQty(input.buyQty);
      if (!buyQty.ok) {
        return fail(rule, buyQty.message);
      }
    }

    var days = { ok: true, value: 1 };
    if (rule.interest) {
      days = parseDays(isBlank(input.days) ? "1" : input.days, "还要填计息天数");
      if (!days.ok) {
        return fail(rule, days.message);
      }
    }

    var breakeven = findBuyback(rule, sellPrice.value, sellQty.value, buyQty.value, days.value);
    if (!breakeven) {
      return tooBig(rule);
    }
    if (rule.interest) {
      breakeven.settled.interestOn = "sell";
    }

    if (buyPriceBlank) {
      if (breakeven.impossible) {
        var stuck = baseResult(rule);
        stuck.status = "ok";
        stuck.tone = "loss";
        stuck.judge = "买到最低价位也不够保本";
        stuck.sub = "卖出扣完费用之后，剩下的钱盖不住最低价位的买入成本。";
        return stuck;
      }
      var preview = breakeven.settled;
      var result = baseResult(rule);
      result.status = "ok";
      result.tone = "flat";
      result.kicker = "保本买回";
      result.value = formatPriceTiny(breakeven.quotedTiny);
      result.unit = rule.currency;
      result.move = priceMove(rule, sellPrice.value, breakeven.quotedTiny);
      result.judge = "买入 " + formatQty(buyQty.value) + " " + rule.qtyUnit;
      result.sub = dropSentence(rule, sellPrice.value, breakeven.quotedTiny);
      if (preview.netFen === 0) {
        result.sub += "买到这个价格，扣完费用刚好打平。";
      } else {
        result.sub += "报到这个价位，扣完费用净赚 " + formatYuan(preview.netFen) + " " + rule.currency + "。";
      }
      if (breakeven.worseNetFen !== null && breakeven.worseNetFen < 0) {
        result.sub += "高一个价位 " + formatPriceTiny(breakeven.worseTickTiny) + " " + rule.currency + "会亏 " + formatYuan(breakeven.worseNetFen) + " " + rule.currency + "。";
      }
      result.caption = "下面按买回价 " + formatPriceTiny(breakeven.quotedTiny) + " " + rule.currency + " 试算。";
      result.rows = tradeRows(rule, preview);
      result.notes = tradeNotes(rule, buyQty.value, sellQty.value, false, preview, {
        quotedTiny: breakeven.quotedTiny,
        exactTiny: breakeven.exactTiny
      });
      if (buyQtyAssumed) {
        result.notes.unshift("买入数量没填，按卖出的 " + formatQty(sellQty.value) + " " + rule.qtyUnit + " 计算。");
      }
      if (rule.interest) {
        result.rateNote = "佣金、过户费、印花税与股票相同。融券利息按卖出金额 × 4.5% / 360 × 天数。没用融券就选股票。";
      }
      result.netFen = preview.netFen;
      result.breakeven = breakeven;
      result.buyQty = buyQty.value;
      return result;
    }

    var buyPrice = parseScaled(input.buyPrice, 4, "买入价格");
    if (!buyPrice.ok) {
      return fail(rule, buyPrice.message);
    }
    var buy = buyLeg(rule, buyPrice.value, buyQty.value, days.value, false);
    var sell = sellLeg(rule, sellPrice.value, sellQty.value, days.value, true);
    if (!buy || !sell) {
      return tooBig(rule);
    }
    var settled = settle(rule, buy, sell);
    if (rule.interest) {
      settled.interestOn = "sell";
    }
    var done = baseResult(rule);
    done.status = "ok";
    done.tone = toneOf(settled.netFen);
    done.kicker = "扣费后";
    done.value = formatSigned(settled.netFen);
    done.unit = rule.currency;
    done.judge = judgeOf(settled.netFen);
    if (breakeven.impossible) {
      done.sub = "买入 " + formatQty(buyQty.value) + " " + rule.qtyUnit + "。这个卖出价扣完费用后，没有保本买回价。";
    } else {
      done.sub = "买入 " + formatQty(buyQty.value) + " " + rule.qtyUnit + "。保本买回价 " + formatPriceTiny(breakeven.quotedTiny) + " " + rule.currency + "。" + dropSentence(rule, sellPrice.value, breakeven.quotedTiny);
    }
    done.notes = [];
    if (buyQtyAssumed) {
      done.notes.push("买入数量没填，按卖出的 " + formatQty(sellQty.value) + " " + rule.qtyUnit + " 计算。");
    }
    done.notes = done.notes.concat(tradeNotes(rule, buyQty.value, sellQty.value, false, settled, breakeven.impossible ? null : {
      quotedTiny: breakeven.quotedTiny,
      exactTiny: breakeven.exactTiny
    }));
    done.rows = tradeRows(rule, settled);
    if (rule.interest) {
      done.rateNote = "佣金、过户费、印花税与股票相同。融券利息按卖出金额 × 4.5% / 360 × 天数。没用融券就选股票。";
    }
    done.netFen = settled.netFen;
    done.breakeven = breakeven;
    done.buyQty = buyQty.value;
    return done;
  }

  function quoteRepo(rule, input) {
    var amountBlank = isBlank(input.amount);
    var rateBlank = isBlank(input.rate);
    var daysBlank = isBlank(input.days);
    if (amountBlank && rateBlank) {
      var empty = baseResult(rule);
      empty.judge = "先填逆回购";
      empty.sub = "填入回购金额、年化利率和占款天数，算出扣掉佣金后的净收益。";
      return empty;
    }
    if (amountBlank) {
      var needAmount = baseResult(rule);
      needAmount.status = "need";
      needAmount.judge = "还要填回购金额";
      return needAmount;
    }
    if (rateBlank) {
      var needRate = baseResult(rule);
      needRate.status = "need";
      needRate.judge = "还要填年化利率";
      return needRate;
    }
    if (daysBlank) {
      var needDays = baseResult(rule);
      needDays.status = "need";
      needDays.judge = "还要填占款天数";
      return needDays;
    }

    var amount = parseScaled(input.amount, 2, "回购金额");
    if (!amount.ok) {
      return fail(rule, amount.message);
    }
    var rate = parseScaled(input.rate, 4, "年化利率");
    if (!rate.ok) {
      return fail(rule, rate.message);
    }
    var days = parseDays(input.days, "还要填占款天数");
    if (!days.ok) {
      return fail(rule, days.message);
    }

    var income = divRound(BigInt(amount.value) * BigInt(rate.value) * BigInt(days.value), 1000000 * 365);
    var comm = charge(amount.value, rule.commission);
    if (income === null || !comm) {
      return tooBig(rule);
    }
    var net = income - comm.fen;
    var result = baseResult(rule);
    result.status = "ok";
    result.tone = toneOf(net);
    result.kicker = "扣费后";
    result.value = formatSigned(net);
    result.unit = "元";
    result.judge = judgeOf(net);
    result.sub = formatYuan(amount.value) + " 元，年化 " + formatPercent(rate.value) + "，占款 " + days.value + " 天。";
    result.rows = [
      moneyRow("回购金额", amount.value, false, "元"),
      moneyRow("利息收入", income, false, "元"),
      moneyRow("佣金", comm.fen, false, "元"),
      (function () {
        var row = moneyRow("净收益", net, true, "元");
        row.strong = true;
        return row;
      })()
    ];
    result.notes = [];
    if (amount.value % 100000 !== 0) {
      result.notes.push("国债逆回购一般按 1000 元的整数倍申报，这里仍按你填的金额算。");
    }
    if (comm.fen === 0) {
      result.notes.push("这笔佣金四舍五入后不到 1 分，按 0 元算。");
    }
    result.netFen = net;
    result.incomeFen = income;
    result.commissionFen = comm.fen;
    return result;
  }

  function quote(input) {
    var raw = input || {};
    var rule = BY_ID[raw.kind] || BY_ID.stock;
    if (rule.mode === "repo") {
      return quoteRepo(rule, raw);
    }
    if (raw.side === "short") {
      return quoteShort(rule, raw);
    }
    return quoteTrade(rule, raw);
  }

  function example(kind) {
    var rule = BY_ID[kind] || BY_ID.stock;
    return rule.example;
  }

  function rateRows() {
    return KINDS.map(function (kind) {
      return {
        name: kind.name,
        commission: kind.commissionText,
        extra: kind.extraText
      };
    });
  }

  return {
    KINDS: KINDS,
    quote: quote,
    example: example,
    rateRows: rateRows
  };
});
