/**
 * PA House Contact Info + Committee Assignments ETL
 * Scrapes the official member directory and bio pages at palegis.us (the PA General
 * Assembly's current site — the legacy legis.state.pa.us domain now 301-redirects here)
 * for Capitol/district office contact details and committee assignments, and writes a
 * static JSON file keyed by district. Static JSON, not a DB write — same reasoning as
 * pa-house-election-history.json: this is reference data that doesn't change per-request,
 * and the add_contact_info.sql migration hasn't been applied yet.
 *
 * Only covers incumbents (the directory only lists sitting members) — challengers have
 * no official bio page and keep whatever official_website/twitter_handle they already
 * have from candidate-filing data.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const PA_LEGIS_BASE = 'https://www.palegis.us';
const USER_AGENT = 'Mozilla/5.0 (compatible; PA-Chamber-Intelligence/1.0)';
const OUTPUT_PATH = path.join(__dirname, '../../public/data/pa-house-contact-info.json');

function rateLimitDelay(ms = 600) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url) {
  const response = await axios.get(url, { timeout: 30000, headers: { 'User-Agent': USER_AGENT } });
  return response.data;
}

async function fetchDirectory() {
  const html = await fetchHtml(`${PA_LEGIS_BASE}/house/members`);
  const $ = cheerio.load(html);
  const entries = [];

  $('.member[data-district]').each((_, el) => {
    const card = $(el);
    const district = card.attr('data-district');
    const bioHref = card.find('a.thumb-info-wrapper').attr('href')?.trim();
    if (!district || !bioHref) return;
    entries.push({
      district,
      name: card.find('.thumb-info-inner').first().text().trim(),
      party: card.attr('data-party') ?? '',
      county: card.attr('data-county') ?? '',
      bioUrl: new URL(bioHref, PA_LEGIS_BASE).toString(),
    });
  });

  return entries;
}

function clean(s) {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t || undefined;
}

function parseBioPage(html) {
  const $ = cheerio.load(html);

  const capitolLines = [];
  $('.h5:contains("Capitol Address")')
    .next('ul.list-icons')
    .find('li')
    .each((_, el) => {
      const text = clean($(el).clone().children('i').remove().end().text());
      if (text) capitolLines.push(text);
    });
  const [, ...capitolRest] = capitolLines;
  const capitolAddressParts = capitolRest.filter((l) => !/^\(\d{3}\)/.test(l));
  const capitolPhoneAll = capitolRest.filter((l) => /^\(\d{3}\)/.test(l));

  const districtCard = $('.h5:contains("District Address")').closest('.row').find('.card').first();
  const districtAddrDiv = districtCard.find('[title="District Office Address"]').parent();
  const districtAddrLine = clean(districtAddrDiv.clone().children('i').remove().end().text());
  const districtCityLine = clean(districtAddrDiv.next('.ms-3').text());
  const districtPhone = clean(districtCard.find('[title="District Office Phone"]').parent().clone().children('i').remove().end().text());
  const districtFax = clean(districtCard.find('[title="District Office Fax"]').parent().clone().children('i').remove().end().text());

  const committeeAssignments = [];
  $('a.committee').each((_, el) => {
    const link = $(el);
    const committee = clean(link.text()) ?? '';
    const committeeUrl = new URL(link.attr('href') ?? '', PA_LEGIS_BASE).toString();
    const container = link.closest('.h6');

    const badgeRole = clean(container.find('.badge').text());
    const roles = [];
    if (badgeRole) roles.push(badgeRole);

    container
      .next('ul.list-icons')
      .find('li')
      .each((_, li) => {
        const text = clean($(li).text());
        if (text) roles.push(text);
      });

    committeeAssignments.push({ committee, committeeUrl, role: roles.length > 0 ? roles.join('; ') : 'Member' });
  });

  // "Biography" section: two optional blockquote.bio lists, Occupation and Education.
  const readBioList = (heading) =>
    $(`#member-info .h5:contains("${heading}")`)
      .next('blockquote.bio')
      .find('li')
      .map((_, li) => clean($(li).text()))
      .get()
      .filter(Boolean);
  const occupation = readBioList('Occupation');
  const education = readBioList('Education');

  // "Stay Connected" card: website/Facebook/Twitter/YouTube + the official constituent contact form.
  const socialLinksRaw = {
    website: $('.card-text a[aria-label^="Webpage"]').attr('href'),
    facebook: $('.card-text a.btn-facebook').attr('href'),
    twitter: $('.card-text a.btn-twitter').attr('href'),
    youtube: $('.card-text a.btn-youtube').attr('href'),
    contactForm: $('.card-text a.btn-telegram').attr('href'),
  };
  const socialLinks = Object.fromEntries(Object.entries(socialLinksRaw).filter(([, v]) => v));

  // "Legislation Sponsored for the YYYY-YYYY Session" chart: real bill/resolution
  // prime-sponsor and co-sponsor counts embedded as JSON on two <canvas> elements.
  let legislativeActivity;
  const sessionHeading = clean($('.h3:contains("Legislation Sponsored")').text());
  const sessionLabel = sessionHeading?.match(/(\d{4}-\d{4} Session)/)?.[1];
  try {
    const billInfo = JSON.parse($('#bill-chart').attr('data-chart-info') ?? '{}');
    const resInfo = JSON.parse($('#resolution-chart').attr('data-chart-info') ?? '{}');
    if (sessionLabel && (billInfo.primeCount !== undefined || resInfo.primeCount !== undefined)) {
      legislativeActivity = {
        sessionLabel,
        billsSponsored: billInfo.primeCount ?? 0,
        billsCoSponsored: billInfo.coCount ?? 0,
        resolutionsSponsored: resInfo.primeCount ?? 0,
        resolutionsCoSponsored: resInfo.coCount ?? 0,
      };
    }
  } catch {
    // Chart markup absent or malformed for this member — leave legislativeActivity undefined.
  }

  return {
    capitolAddress: capitolAddressParts.length > 0 ? capitolAddressParts.join(', ') : undefined,
    capitolPhone: capitolPhoneAll[0],
    capitolFax: capitolPhoneAll[1],
    districtOfficeAddress: districtAddrLine && districtCityLine ? `${districtAddrLine}, ${districtCityLine}` : districtAddrLine,
    districtOfficePhone: districtPhone,
    districtOfficeFax: districtFax,
    committeeAssignments,
    occupation: occupation.length > 0 ? occupation : undefined,
    education: education.length > 0 ? education : undefined,
    socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
    legislativeActivity,
  };
}

async function main() {
  console.log('Fetching House member directory...');
  const directory = await fetchDirectory();
  console.log(`Found ${directory.length} current members.`);

  const byDistrict = {};
  let failures = 0;

  for (const [i, member] of directory.entries()) {
    try {
      const html = await fetchHtml(member.bioUrl);
      const contact = parseBioPage(html);
      byDistrict[member.district] = {
        name: member.name,
        party: member.party,
        county: member.county,
        ...contact,
        source_url: member.bioUrl,
      };
      if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${directory.length} bio pages scraped...`);
    } catch (err) {
      failures++;
      console.error(`  Failed HD-${member.district} (${member.name}): ${err.message}`);
    }
    await rateLimitDelay();
  }

  const output = {
    generated_at: new Date().toISOString(),
    description: 'Contact info and committee assignments for current PA House members, scraped from official bio pages.',
    source: `${PA_LEGIS_BASE}/house/members`,
    districts: byDistrict,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote contact info for ${Object.keys(byDistrict).length} districts to ${OUTPUT_PATH}`);
  if (failures > 0) console.log(`${failures} bio page(s) failed to scrape — see errors above.`);
}

main().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
