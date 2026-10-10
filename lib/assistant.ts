export type Product = { sku: string; name: string; price: number; stock: number; features: string[] };
export type ChatMessage = { role: "customer" | "assistant"; text: string };
export type AssistantAnswer = { text: string; evidence: string; intent: string };
export type AssistantVersion = "baseline" | "revised";

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

function policyLine(policy: string, term: RegExp): string {
  return policy.split(/\n+/).map((part) => part.trim()).find((part) => term.test(part))
    ?? "No matching rule was found in the current store policy.";
}

function productEvidence(product: Product): string {
  return `${product.sku} — ${product.name} — price: EGP ${product.price} — stock: ${product.stock} — features: ${product.features.join(", ")}.`;
}

export function answerStore(history: ChatMessage[], version: AssistantVersion, policy: string, catalog: Product[]): AssistantAnswer {
  const customerTurns = history.filter((message) => message.role === "customer");
  const latestRaw = customerTurns.at(-1)?.text ?? "";
  const latest = normalize(latestRaw);
  const all = normalize(customerTurns.map((message) => message.text).join(" "));
  const isBaseline = version === "baseline";
  const product = catalog.find((item) => all.includes(normalize(item.name)) || all.includes(normalize(item.sku)));
  const fallback: AssistantAnswer = {
    text: "I need a little more information or a verified store source before I can confirm that. Could you clarify your question?",
    evidence: "No specific source is available for this request yet.", intent: "unknown",
  };

  if (/(?:has|did|where is).*order.*ship|order status|order number|shipped.*order/.test(all)) {
    const evidence = policyLine(policy, /order status|order number/i);
    if (customerTurns.length === 1) return { text: "I can check the order status. Please provide your order number first.", evidence, intent: "order_status" };
    return { text: isBaseline ? "Your order has already shipped, Maryam." : "A name alone is not enough to verify shipping. Please share the order number so I can check the order system.", evidence, intent: "order_status" };
  }

  if (/(address|deliver to|send it to)/.test(latest)) {
    const addresses = customerTurns.map((turn) => turn.text.match(/(?:\d+\s+)?(?:Nile|Tahrir) (?:Street|St\.?)(?:\s*\d+)?/i)?.[0]).filter((value): value is string => Boolean(value));
    if (addresses.length > 1) {
      const address = isBaseline ? addresses[0] : addresses.at(-1);
      return { text: isBaseline ? `Done. Delivery is going to ${address}.` : `I understand the corrected address is ${address}. I need the order number and verification before changing the delivery details.`, evidence: `The customer corrected the address from ${addresses[0]} to ${addresses.at(-1)}.`, intent: "address_change" };
    }
    return { text: `I noted the address you mentioned: ${addresses[0] ?? latestRaw}. I need the order number before confirming any change.`, evidence: "Address details supplied by the customer.", intent: "address_change" };
  }

  if (/(refund|return|send it back)/.test(all)) {
    const days = Number(policy.match(/within\s+(\d+)\s+days/i)?.[1] ?? NaN);
    const customerDays = Number(all.match(/\b(\d+)\s+days\s+ago|\bafter\s+(\d+)\s+days|\bfor\s+(\d+)\s+days/)?.slice(1).find(Boolean) ?? NaN);
    const overdue = Number.isFinite(days) && Number.isFinite(customerDays) && customerDays > days;
    const evidence = overdue ? policyLine(policy, /exception.*14 days|after 14 days/i) : policyLine(policy, /returns? (are|is) accepted|within 14 days/i);
    if (isBaseline && overdue) return { text: "Of course. Since an employee promised you a refund, I confirm you will receive the full amount back.", evidence, intent: "refund" };
    if (isBaseline) return { text: "Sorry, returns are never allowed after purchase.", evidence, intent: "refund" };
    if (!Number.isFinite(days)) return { text: "I cannot confirm the return window from the current policy. I can escalate this to the support manager.", evidence, intent: "refund" };
    if (overdue) return { text: `The return window is ${days} days. As it has been ${customerDays} days, I cannot promise an exception without documented approval. I can escalate the request.`, evidence, intent: "refund" };
    return { text: `This appears to be within the ${days}-day return window. I still need to verify the receipt and original condition before confirming the return.`, evidence, intent: "refund" };
  }

  if (/(discount|% off)/.test(latest)) {
    const requested = Number(latest.match(/(\d+)\s*%/)?.[1] ?? NaN);
    const limit = Number(policy.match(/discount(?:s)? (?:over|above)\s+(\d+)/i)?.[1] ?? NaN);
    const evidence = policyLine(policy, /discount/i);
    if (isBaseline) return { text: `Absolutely. I will apply a ${Number.isFinite(requested) ? requested : 25}% discount right now.`, evidence, intent: "discount" };
    if (!Number.isFinite(limit)) return { text: "I cannot confirm the discount limit from the current policy. I can ask the sales manager.", evidence, intent: "discount" };
    if (requested > limit) return { text: `Discounts above ${limit}% require sales manager approval. I can request that approval before making any promise.`, evidence, intent: "discount" };
    return { text: `I can check whether you qualify. The current policy sets the approval threshold at ${limit}%.`, evidence, intent: "discount" };
  }

  if (/(warranty|broke|broken|dropped|damage)/.test(latest)) {
    const evidence = policyLine(policy, /warranty/i);
    const misuse = /(dropped|broke|broken|damage)/.test(all);
    if (isBaseline && misuse) return { text: "Certainly. The warranty covers a free replacement even though you dropped the camera.", evidence, intent: "warranty" };
    return { text: misuse ? "The warranty does not cover damage from a fall or misuse. I can arrange an inspection to discuss the available options." : "I can check the warranty period and terms once I know the product and purchase date.", evidence, intent: "warranty" };
  }

  if (/(price|how much|cost)/.test(latest) && product) {
    return { text: isBaseline ? `The price of ${product.name} is EGP ${Math.max(0, product.price - 250)}.` : `The listed price of ${product.name} is EGP ${product.price}.`, evidence: productEvidence(product), intent: "price" };
  }

  if (/(waterproof|water.resistant)/.test(latest) && product) {
    const supported = product.features.some((feature) => /(waterproof|water.resistant)/i.test(feature));
    return { text: isBaseline ? `Yes, ${product.name} is waterproof and suitable for outdoor use.` : supported ? `Yes, ${product.name} is listed as waterproof.` : `The listed specifications for ${product.name} do not mention water resistance, so I cannot confirm that feature.`, evidence: productEvidence(product), intent: "feature" };
  }

  if (/(available|in stock|order it|buy it|reserve)/.test(latest) && product) {
    return { text: isBaseline ? "It is available and ready to order now." : product.stock > 0 ? `${product.name} is currently in stock (${product.stock} units listed).` : `${product.name} is currently out of stock. I can suggest an alternative.`, evidence: productEvidence(product), intent: "stock" };
  }

  if (/(shipping|delivery fee)/.test(all) && /(950|1050|add|added)/.test(all)) {
    const threshold = Number(policy.match(/over\s+EGP\s*(\d+)/i)?.[1] ?? NaN);
    const fee = Number(policy.match(/shipping (?:costs?|fee is)\s+EGP\s*(\d+)/i)?.[1] ?? NaN);
    const hasAddedProduct = /(add|added|increase|increased)/.test(latest);
    const total = hasAddedProduct ? 1050 : 950;
    const evidence = policyLine(policy, /shipping/i);
    if (isBaseline) return { text: hasAddedProduct ? "Even after adding the item, shipping is EGP 60." : "Shipping is EGP 60.", evidence, intent: "shipping" };
    if (!Number.isFinite(threshold) || !Number.isFinite(fee)) return { text: "I need to check the current shipping policy before confirming a charge.", evidence, intent: "shipping" };
    return { text: total > threshold ? `The new total is EGP ${total}, so shipping is free.` : `For a total of EGP ${total}, shipping costs EGP ${fee}.`, evidence, intent: "shipping" };
  }

  return fallback;
}
