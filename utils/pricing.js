function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getBaseSellingPrice(product) {
  if (product?.onSale && Number(product?.salePrice) >= 0) {
    return roundMoney(product.salePrice);
  }
  return roundMoney(product?.price);
}

function getProductPricing(product, subscriptionDiscountPercent = 0) {
  const originalPrice = roundMoney(product?.price);
  const baseSellingPrice = getBaseSellingPrice(product);
  const subscriptionPercent = Math.max(0, Number(subscriptionDiscountPercent) || 0);
  const subscriptionDiscountAmount = roundMoney(baseSellingPrice * (subscriptionPercent / 100));
  const effectivePrice = roundMoney(Math.max(0, baseSellingPrice - subscriptionDiscountAmount));
  const offerDiscountPercent =
    product?.onSale && originalPrice > 0
      ? Math.max(0, Math.round(((originalPrice - baseSellingPrice) / originalPrice) * 100))
      : 0;

  return {
    originalPrice,
    baseSellingPrice,
    effectivePrice,
    subscriptionDiscountAmount,
    subscriptionDiscountPercent: subscriptionPercent,
    offerDiscountPercent,
  };
}

module.exports = { roundMoney, getBaseSellingPrice, getProductPricing };
