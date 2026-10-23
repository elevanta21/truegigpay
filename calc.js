/*
 * True Gig Pay — calculation engine.
 * Pure functions only: no DOM, no storage, no network calls.
 * Runs in the browser (window.TrueGigPay) and in Node (module.exports) for tests.
 *
 * ============================ CONSTANTS ============================
 * Every rate below is an official figure with a source and an
 * effective period, verified on the date in RATES_VERIFIED_ON.
 * To update rates: edit ONLY this block, bump RATES_VERIFIED_ON,
 * and record the change in ../CHANGELOG.md. See README.md.
 * ===================================================================
 */
(function (global) {
  'use strict';

  var CONSTANTS = {
    RATES_VERIFIED_ON: '2026-10-22',

    /* IRS standard mileage rate, tax year 2026.
       Jan–Jun: IRS Notice 2026-10 / IR-2025-128 (72.5 cents).
       Jul–Dec: mid-year increase, IR-2026-29 (76 cents). */
    IRS_MILEAGE_2026_H1: 0.725,          // $ per mile, Jan 1 – Jun 30, 2026
    IRS_MILEAGE_2026_H2: 0.76,           // $ per mile, Jul 1 – Dec 31, 2026
    IRS_MILEAGE_SPLIT_ISO: '2026-07-01', // first day at the H2 rate

    /* Self-employment tax (IRS Schedule SE). */
    SE_TAX_RATE: 0.153,                  // 12.4% Social Security + 2.9% Medicare
    SE_SS_RATE: 0.124,
    SE_MEDICARE_RATE: 0.029,
    SE_NET_FACTOR: 0.9235,               // SE tax applies to 92.35% of net SE income
    SS_WAGE_BASE_2026: 184500,           // Social Security wage base, 2026 (SSA)

    /* California Prop 22 (Bus. & Prof. Code §7453), 2026.
       Guarantee = 120% of applicable minimum wage for engaged time
       + per-engaged-mile amount set by the CA State Treasurer. */
    CA_MIN_WAGE_2026: 16.90,             // statewide minimum wage, 2026 (CA DIR)
    PROP22_WAGE_MULTIPLIER: 1.20,
    PROP22_PER_MILE_2026: 0.37,          // $ per engaged mile, 2026

    /* New York City app-based delivery minimum pay (NYC DCWP),
       before tips, effective April 1, 2026. */
    NYC_HOURLY_2026: 22.13,              // $ per hour of trip (engaged) time

    /* Seattle App-Based Worker Minimum Payment Ordinance (SMC 8.37),
       Seattle Office of Labor Standards, 2026 amounts.
       Pay = greater of (per-minute x engaged minutes + per-mile x engaged
       miles) or the per-offer minimum, calculated per offer. */
    SEATTLE_APP_PER_MINUTE: 0.47,
    SEATTLE_APP_PER_MILE: 0.80,
    SEATTLE_APP_MIN_PER_OFFER: 5.34,

    /* Washington State TNC (rideshare) minimum compensation,
       RCW 49.46.300, published by WA L&I, effective January 1, 2026.
       Applies to passenger platform time/miles; greater of the
       per-minute + per-mile sum or the per-trip minimum. */
    WA_TNC_SEATTLE_PER_MINUTE: 0.70,
    WA_TNC_SEATTLE_PER_MILE: 1.63,
    WA_TNC_SEATTLE_MIN_PER_TRIP: 6.12,
    WA_TNC_OUTSIDE_PER_MINUTE: 0.40,
    WA_TNC_OUTSIDE_PER_MILE: 1.38,
    WA_TNC_OUTSIDE_MIN_PER_TRIP: 3.55
  };

  /* ---------------- helpers ---------------- */

  function isNum(x) {
    return typeof x === 'number' && isFinite(x);
  }

  /* Division that can never produce NaN/Infinity: returns null instead. */
  function safeDiv(a, b) {
    if (!isNum(a) || !isNum(b) || b <= 0) return null;
    var v = a / b;
    return isFinite(v) ? v : null;
  }

  function round2(x) {
    if (!isNum(x)) return null;
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  /* Parse 'YYYY-MM-DD' to a whole-day number (UTC), or null. */
  function dayNumber(iso) {
    if (typeof iso !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var ms = Date.UTC(y, mo - 1, d);
    var dt = new Date(ms);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return ms / 86400000;
  }

  /* IRS mileage rate in effect on a given ISO date (2026 schedule). */
  function mileageRateForDate(iso) {
    var d = dayNumber(iso), split = dayNumber(CONSTANTS.IRS_MILEAGE_SPLIT_ISO);
    if (d === null || split === null) return null;
    return d < split ? CONSTANTS.IRS_MILEAGE_2026_H1 : CONSTANTS.IRS_MILEAGE_2026_H2;
  }

  /*
   * IRS standard-mileage vehicle cost for a work period in 2026.
   * Miles are spread evenly across the days of the period (start and end
   * dates inclusive); days before Jul 1 use the H1 rate, days on/after
   * use the H2 rate. Returns null for invalid input.
   */
  function mileageCost2026(miles, startISO, endISO) {
    if (!isNum(miles) || miles < 0) return null;
    var s = dayNumber(startISO), e = dayNumber(endISO), split = dayNumber(CONSTANTS.IRS_MILEAGE_SPLIT_ISO);
    if (s === null || e === null || split === null || e < s) return null;
    var totalDays = e - s + 1;
    var h1Days = Math.max(0, Math.min(e, split - 1) - s + 1);
    var h1Miles = miles * (h1Days / totalDays);
    var h2Miles = miles - h1Miles;
    var cost = h1Miles * CONSTANTS.IRS_MILEAGE_2026_H1 + h2Miles * CONSTANTS.IRS_MILEAGE_2026_H2;
    return {
      cost: cost,
      h1Miles: h1Miles,
      h2Miles: h2Miles,
      h1Days: h1Days,
      h2Days: totalDays - h1Days,
      totalDays: totalDays,
      h1Rate: CONSTANTS.IRS_MILEAGE_2026_H1,
      h2Rate: CONSTANTS.IRS_MILEAGE_2026_H2
    };
  }

  /* Actual-cost vehicle expense: fuel from MPG/price, plus other costs. */
  function actualVehicleCost(miles, mpg, fuelPricePerGallon, otherCosts) {
    if (!isNum(miles) || miles < 0) return null;
    if (!isNum(mpg) || mpg <= 0) return null;
    if (!isNum(fuelPricePerGallon) || fuelPricePerGallon < 0) return null;
    var other = isNum(otherCosts) && otherCosts > 0 ? otherCosts : 0;
    var fuel = (miles / mpg) * fuelPricePerGallon;
    return { cost: fuel + other, fuelCost: fuel, otherCosts: other };
  }

  /*
   * Self-employment tax estimate (IRS Schedule SE method).
   * netSEIncome: net profit from self-employment for the period/year.
   * ssWagesAlready: Social Security wages already earned this year
   * (W-2 wages + other SE income) that count toward the wage-base cap.
   * No tax when net SE income is zero or negative.
   */
  function seTax(netSEIncome, ssWagesAlready) {
    var zero = { taxableBase: 0, ssTaxable: 0, ssTax: 0, medicareTax: 0, total: 0 };
    if (!isNum(netSEIncome) || netSEIncome <= 0) return zero;
    var base = netSEIncome * CONSTANTS.SE_NET_FACTOR;
    var already = isNum(ssWagesAlready) && ssWagesAlready > 0 ? ssWagesAlready : 0;
    var ssRoom = Math.max(0, CONSTANTS.SS_WAGE_BASE_2026 - already);
    var ssTaxable = Math.min(base, ssRoom);
    var ssTax = ssTaxable * CONSTANTS.SE_SS_RATE;
    var medicareTax = base * CONSTANTS.SE_MEDICARE_RATE;
    return {
      taxableBase: base,
      ssTaxable: ssTaxable,
      ssTax: ssTax,
      medicareTax: medicareTax,
      total: ssTax + medicareTax
    };
  }

  function perHour(amount, hours) {
    return safeDiv(amount, hours);
  }

  /*
   * Statutory pay-floor estimate for a block of engaged work.
   * jurisdiction: 'ca' | 'nyc' | 'seattle-app' | 'wa-tnc-seattle' | 'wa-tnc-outside'
   * opts: { engagedMinutes, engagedMiles, trips (optional),
   *         caMinWage (optional override for CA local minimum wage) }
   * NOTE: Seattle/WA floors legally apply per offer/trip; applying them to
   * a period total is an approximation, labeled as such in the UI.
   */
  function payFloor(jurisdiction, opts) {
    if (!opts) return null;
    var minutes = opts.engagedMinutes, miles = opts.engagedMiles;
    if (!isNum(minutes) || minutes < 0 || !isNum(miles) || miles < 0) return null;
    var trips = isNum(opts.trips) && opts.trips > 0 ? opts.trips : 0;
    var combo, floor, perTripMinApplied = false;

    switch (jurisdiction) {
      case 'ca': {
        var wage = isNum(opts.caMinWage) && opts.caMinWage > 0 ? opts.caMinWage : CONSTANTS.CA_MIN_WAGE_2026;
        combo = CONSTANTS.PROP22_WAGE_MULTIPLIER * wage * (minutes / 60) + CONSTANTS.PROP22_PER_MILE_2026 * miles;
        floor = combo;
        break;
      }
      case 'nyc':
        combo = CONSTANTS.NYC_HOURLY_2026 * (minutes / 60);
        floor = combo;
        break;
      case 'seattle-app':
        combo = CONSTANTS.SEATTLE_APP_PER_MINUTE * minutes + CONSTANTS.SEATTLE_APP_PER_MILE * miles;
        floor = combo;
        if (trips > 0) {
          var seaOfferFloor = CONSTANTS.SEATTLE_APP_MIN_PER_OFFER * trips;
          if (seaOfferFloor > floor) { floor = seaOfferFloor; perTripMinApplied = true; }
        }
        break;
      case 'wa-tnc-seattle':
        combo = CONSTANTS.WA_TNC_SEATTLE_PER_MINUTE * minutes + CONSTANTS.WA_TNC_SEATTLE_PER_MILE * miles;
        floor = combo;
        if (trips > 0) {
          var waSeaFloor = CONSTANTS.WA_TNC_SEATTLE_MIN_PER_TRIP * trips;
          if (waSeaFloor > floor) { floor = waSeaFloor; perTripMinApplied = true; }
        }
        break;
      case 'wa-tnc-outside':
        combo = CONSTANTS.WA_TNC_OUTSIDE_PER_MINUTE * minutes + CONSTANTS.WA_TNC_OUTSIDE_PER_MILE * miles;
        floor = combo;
        if (trips > 0) {
          var waOutFloor = CONSTANTS.WA_TNC_OUTSIDE_MIN_PER_TRIP * trips;
          if (waOutFloor > floor) { floor = waOutFloor; perTripMinApplied = true; }
        }
        break;
      default:
        return null;
    }
    if (!isFinite(floor)) return null;
    return { floor: floor, comboAmount: combo, perTripMinApplied: perTripMinApplied };
  }

  /*
   * Offer quick-check: is a single offer worth taking?
   * ratePerMile: vehicle cost per mile to deduct (IRS rate for the date).
   * Verdict bands apply to the NET $/hr after mileage cost.
   */
  function offerCheck(pay, miles, minutes, ratePerMile) {
    if (!isNum(pay) || pay < 0) return null;
    if (!isNum(miles) || miles < 0) return null;
    if (!isNum(minutes) || minutes <= 0) return null;
    if (!isNum(ratePerMile) || ratePerMile < 0) return null;
    var hours = minutes / 60;
    var grossPerHour = pay / hours;
    var perMile = miles > 0 ? pay / miles : null;
    var vehicleCost = miles * ratePerMile;
    var net = pay - vehicleCost;
    var netPerHour = net / hours;
    var verdict;
    if (netPerHour >= 25) verdict = 'strong';
    else if (netPerHour >= 18) verdict = 'decent';
    else if (netPerHour >= 12) verdict = 'marginal';
    else verdict = 'poor';
    return {
      grossPerHour: grossPerHour,
      perMile: perMile,
      vehicleCost: vehicleCost,
      net: net,
      netPerHour: netPerHour,
      verdict: verdict
    };
  }

  /*
   * Main calculator. Input fields (numbers; optional ones may be null):
   * { gross, hours, engagedHours, miles, trips, mode: 'irs'|'actual',
   *   startISO, endISO, fuelPrice, mpg, otherCosts, ssWages }
   * Monetary/hourly outputs are raw numbers or null when not computable —
   * never NaN or Infinity. `net` here is gross minus vehicle cost only;
   * SE tax is computed on that same net profit figure.
   */
  function computeMain(inp) {
    if (!inp) return null;
    var gross = inp.gross, hours = inp.hours, miles = inp.miles;
    if (!isNum(gross) || gross < 0) return null;
    if (!isNum(hours) || hours < 0) return null;
    if (!isNum(miles) || miles < 0) return null;

    var vehicle = null;
    if (inp.mode === 'actual') {
      vehicle = actualVehicleCost(miles, inp.mpg, inp.fuelPrice, inp.otherCosts);
    } else {
      vehicle = mileageCost2026(miles, inp.startISO, inp.endISO);
    }
    if (!vehicle) return null;

    var net = gross - vehicle.cost;
    var se = seTax(net, inp.ssWages);
    var takeHome = net - se.total;
    var days = vehicle.totalDays || null; // present in IRS mode
    var engaged = isNum(inp.engagedHours) && inp.engagedHours > 0 ? inp.engagedHours : null;
    var trips = isNum(inp.trips) && inp.trips > 0 ? inp.trips : null;

    return {
      grossPerHour: perHour(gross, hours),
      grossPerEngagedHour: engaged ? perHour(gross, engaged) : null,
      vehicleCost: vehicle.cost,
      vehicleDetail: vehicle,
      net: net,
      netPerHour: perHour(net, hours),
      netPerEngagedHour: engaged ? perHour(net, engaged) : null,
      seTax: se,
      takeHome: takeHome,
      takeHomePerHour: perHour(takeHome, hours),
      grossPerTrip: trips ? gross / trips : null,
      netPerTrip: trips ? net / trips : null,
      periodDays: days,
      setAsidePerWeek: days ? se.total * (7 / days) : null,
      setAsidePerQuarter: days ? se.total * (91.25 / days) : null,
      setAsidePctOfNet: net > 0 ? (se.total / net) * 100 : null
    };
  }

  var api = {
    CONSTANTS: CONSTANTS,
    isNum: isNum,
    safeDiv: safeDiv,
    round2: round2,
    dayNumber: dayNumber,
    mileageRateForDate: mileageRateForDate,
    mileageCost2026: mileageCost2026,
    actualVehicleCost: actualVehicleCost,
    seTax: seTax,
    perHour: perHour,
    payFloor: payFloor,
    offerCheck: offerCheck,
    computeMain: computeMain
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.TrueGigPay = api;
})(typeof window !== 'undefined' ? window : this);
