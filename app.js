/*
 * True Gig Pay — page wiring for index.html.
 * All math lives in calc.js (window.TrueGigPay). This file only reads
 * inputs, validates them, and renders results. Nothing is sent anywhere;
 * there is no storage and no network use.
 */
(function () {
  'use strict';
  var TGP = window.TrueGigPay;
  var C = TGP.CONSTANTS;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return (typeof n === 'number' && isFinite(n)) ? usd.format(n) : '—'; }
  function fmtNum(n, digits) {
    return (typeof n === 'number' && isFinite(n))
      ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : '—';
  }
  function todayLocalISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function addDaysISO(iso, days) {
    var day = TGP.dayNumber(iso);
    if (day === null) return null;
    var dt = new Date((day + days) * 86400000);
    var m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    var d = String(dt.getUTCDate()).padStart(2, '0');
    return dt.getUTCFullYear() + '-' + m + '-' + d;
  }
  function addMonthMinusDayISO(iso) {
    var parts = iso.split('-');
    var y = +parts[0], mo = +parts[1], d = +parts[2];
    var target = new Date(Date.UTC(y, mo, d)); // first of next month (mo is 1-based here)
    var last = new Date(target.getTime() - 86400000);
    var m = String(last.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(last.getUTCDate()).padStart(2, '0');
    return last.getUTCFullYear() + '-' + m + '-' + dd;
  }

  /* ---------- validation helpers ---------- */
  function clearError(input, errEl) {
    if (input) input.removeAttribute('aria-invalid');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  }
  function setError(input, errEl, msg) {
    if (input) input.setAttribute('aria-invalid', 'true');
    if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
  }
  // Returns { value: number|null, error: string|null }. Empty optional -> value null.
  function readField(id, errId, opts) {
    var input = $(id), errEl = errId ? $(errId) : null;
    clearError(input, errEl);
    var raw = input.value.trim();
    if (raw === '') {
      if (opts.required) {
        var msg = opts.label + ' is required.';
        setError(input, errEl, msg);
        return { value: null, error: msg };
      }
      return { value: null, error: null };
    }
    var v = Number(raw);
    if (!isFinite(v)) {
      var msg2 = opts.label + ' must be a number.';
      setError(input, errEl, msg2);
      return { value: null, error: msg2 };
    }
    if (opts.min !== undefined && v < opts.min) {
      var msg3 = opts.label + ' can\'t be less than ' + opts.min + '.';
      setError(input, errEl, msg3);
      return { value: null, error: msg3 };
    }
    if (opts.gt !== undefined && !(v > opts.gt)) {
      var msg4 = opts.label + ' must be more than ' + opts.gt + '.';
      setError(input, errEl, msg4);
      return { value: null, error: msg4 };
    }
    return { value: v, error: null };
  }
  function showSummary(el, errors) {
    if (errors.length) {
      el.innerHTML = '<p>Please fix the following:</p><ul>' +
        errors.map(function (e) { return '<li>' + e + '</li>'; }).join('') + '</ul>';
      el.hidden = false;
    } else {
      el.hidden = true;
      el.innerHTML = '';
    }
  }

  /* ---------- main calculator ---------- */
  var startEl = $('start-date'), endEl = $('end-date'), periodEl = $('period');

  function setDefaultDates() {
    var end = todayLocalISO();
    endEl.value = end;
    startEl.value = addDaysISO(end, -6) || end;
    periodEl.value = 'week';
  }
  setDefaultDates();

  periodEl.addEventListener('change', function () {
    var start = startEl.value;
    if (!start || TGP.dayNumber(start) === null) return;
    if (periodEl.value === 'day') endEl.value = start;
    else if (periodEl.value === 'week') endEl.value = addDaysISO(start, 6);
    else if (periodEl.value === 'month') endEl.value = addMonthMinusDayISO(start);
    // 'custom' leaves dates as-is
  });
  [startEl, endEl].forEach(function (el) {
    el.addEventListener('change', function () { periodEl.value = 'custom'; });
  });

  var vmodeRadios = document.querySelectorAll('input[name="vmode"]');
  function currentMode() {
    var checked = document.querySelector('input[name="vmode"]:checked');
    return checked ? checked.value : 'irs';
  }
  function syncModeFields() {
    var actual = currentMode() === 'actual';
    $('actual-fields').hidden = !actual;
    $('irs-note').hidden = actual;
  }
  vmodeRadios.forEach(function (r) { r.addEventListener('change', syncModeFields); });
  syncModeFields();

  $('platform').addEventListener('change', function () {
    var isInstacart = $('platform').value === 'Instacart';
    $('r-vehicle-note-label').textContent = 'How that vehicle cost was figured';
    document.querySelector('#row-per-trip th').textContent =
      isInstacart ? 'Gross / net per batch' : 'Gross / net per delivery or trip';
  });

  $('calc-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var errors = [];

    var gross = readField('gross', 'err-gross', { required: true, min: 0, label: 'Gross pay' });
    var hours = readField('hours', 'err-hours', { required: true, gt: 0, label: 'Total hours worked' });
    var engaged = readField('engaged-hours', 'err-engaged', { required: false, min: 0, label: 'Engaged hours' });
    var miles = readField('miles', 'err-miles', { required: true, min: 0, label: 'Total miles driven' });
    var trips = readField('trips', 'err-trips', { required: false, min: 0, label: 'Deliveries / trips' });
    var ssWages = readField('ss-wages', 'err-sswages', { required: false, min: 0, label: 'Social Security wages' });
    [gross, hours, engaged, miles, trips, ssWages].forEach(function (f) { if (f.error) errors.push(f.error); });

    if (engaged.value !== null && hours.value !== null && engaged.value > hours.value) {
      var emsg = 'Engaged hours can\'t be more than total hours worked.';
      setError($('engaged-hours'), $('err-engaged'), emsg);
      errors.push(emsg);
    }

    var mode = currentMode();
    var fuel = { value: null }, mpg = { value: null }, other = { value: null };
    if (mode === 'actual') {
      fuel = readField('fuel-price', 'err-fuel', { required: true, min: 0, label: 'Fuel price' });
      mpg = readField('mpg', 'err-mpg', { required: true, gt: 0, label: 'MPG' });
      other = readField('other-costs', null, { required: false, min: 0, label: 'Other vehicle costs' });
      [fuel, mpg, other].forEach(function (f) { if (f.error) errors.push(f.error); });
    } else {
      if (!startEl.value || TGP.dayNumber(startEl.value) === null) errors.push('Period start date is required for the IRS mileage mode.');
      if (!endEl.value || TGP.dayNumber(endEl.value) === null) errors.push('Period end date is required for the IRS mileage mode.');
      if (startEl.value && endEl.value && TGP.dayNumber(endEl.value) < TGP.dayNumber(startEl.value)) {
        errors.push('Period end date is before the start date.');
      }
    }

    showSummary($('calc-errors'), errors);
    if (errors.length) { $('calc-results').hidden = true; $('calc-errors').focus && $('calc-errors').scrollIntoView({ block: 'nearest' }); return; }

    var res = TGP.computeMain({
      gross: gross.value,
      hours: hours.value,
      engagedHours: engaged.value,
      miles: miles.value,
      trips: trips.value,
      mode: mode,
      startISO: startEl.value,
      endISO: endEl.value,
      fuelPrice: fuel.value,
      mpg: mpg.value,
      otherCosts: other.value,
      ssWages: ssWages.value || 0
    });
    if (!res) {
      showSummary($('calc-errors'), ['Those inputs couldn\'t be calculated. Check the dates and numbers and try again.']);
      $('calc-results').hidden = true;
      return;
    }

    // Set-aside fallback: derive period length from the date inputs in actual-cost mode.
    var setWeek = res.setAsidePerWeek, setQuarter = res.setAsidePerQuarter;
    if (setWeek === null && startEl.value && endEl.value) {
      var days = TGP.dayNumber(endEl.value) - TGP.dayNumber(startEl.value) + 1;
      if (days > 0) {
        setWeek = res.seTax.total * (7 / days);
        setQuarter = res.seTax.total * (91.25 / days);
      }
    }

    $('r-gross-hr').textContent = fmt(res.grossPerHour);
    $('row-gross-engaged').hidden = res.grossPerEngagedHour === null;
    $('r-gross-engaged-hr').textContent = fmt(res.grossPerEngagedHour);
    $('r-vehicle').textContent = fmt(res.vehicleCost);
    var note;
    if (mode === 'irs' && res.vehicleDetail) {
      var d = res.vehicleDetail;
      if (d.h1Miles > 0 && d.h2Miles > 0) {
        note = fmtNum(d.h1Miles, 0) + ' mi @ 72.5¢ (Jan–Jun) + ' + fmtNum(d.h2Miles, 0) + ' mi @ 76¢ (Jul–Dec), split by period days';
      } else if (d.h2Miles > 0) {
        note = fmtNum(d.h2Miles, 0) + ' mi @ 76¢ (Jul 1–Dec 31, 2026 rate)';
      } else {
        note = fmtNum(d.h1Miles, 0) + ' mi @ 72.5¢ (Jan 1–Jun 30, 2026 rate)';
      }
    } else if (res.vehicleDetail) {
      note = 'Fuel ' + fmt(res.vehicleDetail.fuelCost) + ' + other costs ' + fmt(res.vehicleDetail.otherCosts);
    } else { note = '—'; }
    $('r-vehicle-note').textContent = note;
    $('r-net').textContent = fmt(res.net);
    $('r-net-hr').textContent = fmt(res.netPerHour);
    $('row-net-engaged').hidden = res.netPerEngagedHour === null;
    $('r-net-engaged-hr').textContent = fmt(res.netPerEngagedHour);
    $('row-per-trip').hidden = res.grossPerTrip === null;
    $('r-per-trip').textContent = res.grossPerTrip === null ? '—' : (fmt(res.grossPerTrip) + ' / ' + fmt(res.netPerTrip));
    $('r-se-tax').textContent = fmt(res.seTax.total) + (res.setAsidePctOfNet !== null ? ' (about ' + fmtNum(res.setAsidePctOfNet, 1) + '% of this period\'s net profit)' : '');
    $('r-set-week').textContent = fmt(setWeek);
    $('r-set-quarter').textContent = fmt(setQuarter);
    $('r-takehome').textContent = fmt(res.takeHome) + ' for the period' +
      (res.takeHomePerHour !== null ? ' — ' + fmt(res.takeHomePerHour) + ' per total hour' : '');

    $('calc-results').hidden = false;
    $('calc-results').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  /* ---------- pay-floor check ---------- */
  var jurEl = $('jurisdiction');
  function syncJur() { $('ca-wage-field').hidden = jurEl.value !== 'ca'; }
  jurEl.addEventListener('change', syncJur);
  syncJur();

  var FLOOR_LABELS = {
    'ca': 'California Prop 22 estimate',
    'nyc': 'New York City minimum-pay estimate',
    'seattle-app': 'Seattle app-based minimum estimate',
    'wa-tnc-seattle': 'WA rideshare (Seattle trips) estimate',
    'wa-tnc-outside': 'WA rideshare (outside Seattle) estimate'
  };
  var FLOOR_NOTES = {
    'ca': 'Formula: 120% of the minimum wage ($16.90 statewide for 2026, or your local wage if you entered one) per engaged hour + $0.37 per engaged mile. Platforms typically calculate the Prop 22 guarantee over a pay period (often two weeks) and add a top-up adjustment afterwards, so one block below the floor does not by itself prove underpayment — check for a guarantee adjustment on your earnings statement.',
    'nyc': 'NYC\'s standard is $22.13 per hour of trip time, before tips, effective April 1, 2026. Platforms apply the city rule using their own trip-time accounting, and tips never count toward it. Treat this as a comparison figure, not a ruling.',
    'seattle-app': 'Seattle\'s ordinance (SMC 8.37) pays, per offer, the greater of $0.47 per engaged minute + $0.80 per engaged mile, or $5.34 per offer — 2026 amounts. This check applies those amounts to your whole block at once using the offers count you entered, which is an approximation of the per-offer calculation.',
    'wa-tnc-seattle': 'Washington\'s rideshare rates (WA L&I, from Jan 1, 2026) apply per trip to passenger platform time and miles: the greater of $0.70/minute + $1.63/mile, or $6.12 per trip, for trips starting in Seattle. Aggregating over a block is an approximation.',
    'wa-tnc-outside': 'Washington\'s rideshare rates (WA L&I, from Jan 1, 2026) apply per trip to passenger platform time and miles: the greater of $0.40/minute + $1.38/mile, or $3.55 per trip, for trips starting and ending outside Seattle. Aggregating over a block is an approximation.'
  };

  $('floor-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var errors = [];
    var hrs = readField('floor-engaged-hours', 'err-floor-hours', { required: true, gt: 0, label: 'Engaged hours' });
    var mi = readField('floor-engaged-miles', 'err-floor-miles', { required: true, min: 0, label: 'Engaged miles' });
    var grossF = readField('floor-gross', 'err-floor-gross', { required: true, min: 0, label: 'Pay for the block' });
    var tripsF = readField('floor-trips', null, { required: false, min: 0, label: 'Deliveries / offers / trips' });
    var caWage = readField('ca-wage', null, { required: false, min: 0, label: 'Local CA minimum wage' });
    [hrs, mi, grossF, tripsF, caWage].forEach(function (f) { if (f.error) errors.push(f.error); });
    showSummary($('floor-errors'), errors);
    if (errors.length) { $('floor-results').hidden = true; return; }

    var res = TGP.payFloor(jurEl.value, {
      engagedMinutes: hrs.value * 60,
      engagedMiles: mi.value,
      trips: tripsF.value || 0,
      caMinWage: caWage.value
    });
    if (!res) {
      showSummary($('floor-errors'), ['Those inputs couldn\'t be checked. Review the numbers and try again.']);
      $('floor-results').hidden = true;
      return;
    }
    var diff = grossF.value - res.floor;
    var pct = res.floor > 0 ? (grossF.value / res.floor) * 100 : null;
    $('floor-name-label').textContent = FLOOR_LABELS[jurEl.value] || 'Estimated legal floor';
    $('f-floor').textContent = fmt(res.floor);
    $('f-actual').textContent = fmt(grossF.value);
    $('f-diff').textContent = (diff >= 0 ? '+' : '-') + fmt(Math.abs(diff));
    var verdict = $('f-verdict');
    if (diff >= 0) {
      verdict.className = 'verdict good';
      verdict.textContent = 'At or above the estimated floor' + (pct !== null ? ' (' + fmtNum(pct, 0) + '% of the floor)' : '') + '.';
    } else {
      verdict.className = 'verdict bad';
      verdict.textContent = 'Below the estimated floor by ' + fmt(Math.abs(diff)) + (pct !== null ? ' (you were paid about ' + fmtNum(pct, 0) + '% of the floor)' : '') + '. Check your earnings statement for a top-up/guarantee adjustment before drawing conclusions — and keep your pay statements.';
    }
    $('f-note').textContent = FLOOR_NOTES[jurEl.value] || '';
    $('floor-results').hidden = false;
    $('floor-results').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  /* ---------- offer quick-check ---------- */
  $('offer-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var errors = [];
    var pay = readField('offer-pay', 'err-offer-pay', { required: true, min: 0, label: 'Offer pay' });
    var mi = readField('offer-miles', 'err-offer-miles', { required: true, min: 0, label: 'Total miles' });
    var min = readField('offer-minutes', 'err-offer-minutes', { required: true, gt: 0, label: 'Estimated minutes' });
    [pay, mi, min].forEach(function (f) { if (f.error) errors.push(f.error); });
    showSummary($('offer-errors'), errors);
    if (errors.length) { $('offer-results').hidden = true; return; }

    var iso = todayLocalISO();
    var rate = TGP.mileageRateForDate(iso);
    var res = TGP.offerCheck(pay.value, mi.value, min.value, rate);
    if (!res) {
      showSummary($('offer-errors'), ['Those inputs couldn\'t be checked. Review the numbers and try again.']);
      $('offer-results').hidden = true;
      return;
    }
    $('o-gross-hr').textContent = fmt(res.grossPerHour);
    $('o-per-mile').textContent = res.perMile === null ? '—' : fmt(res.perMile);
    $('o-vehicle').textContent = fmt(res.vehicleCost) + ' (at ' + Math.round(rate * 100) + '¢/mi, today\'s 2026 IRS rate)';
    $('o-net-hr').textContent = fmt(res.netPerHour);
    var verdict = $('o-verdict');
    var lines = {
      strong: ['verdict good', 'Strong offer — the net hourly math is well into worthwhile territory.'],
      decent: ['verdict good', 'Decent offer — solidly positive after vehicle cost.'],
      marginal: ['verdict warn', 'Marginal — after vehicle cost the hourly math is thin. It may still make sense if it chains into better offers or heads your direction.'],
      poor: ['verdict bad', 'Likely a skip — after vehicle cost, this pays poorly per hour.']
    };
    verdict.className = lines[res.verdict][0];
    verdict.textContent = lines[res.verdict][1];
    $('o-note').textContent = 'Verdict bands are a rough guide based on net $/hour after the IRS mileage cost: $25+ strong, $18–$25 decent, $12–$18 marginal, under $12 poor. Your real costs and goals may differ — the $/hour and $/mile figures are the solid part.';
    $('offer-results').hidden = false;
    $('offer-results').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
})();
