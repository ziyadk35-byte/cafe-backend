const Product = require('../models/Product');
const Settings = require('../models/Settings');
const { getProductPricing } = require('../utils/pricing');

const DEMO_PRODUCTS = [
  {
    name: 'كابتشينو', nameEn: 'Cappuccino', description: 'إسبريسو غني مع حليب مبخر ورغوة كريمية.', descriptionEn: 'Rich espresso with steamed milk and creamy foam.',
    ingredients: ['إسبريسو', 'حليب', 'رغوة حليب'], ingredientsEn: ['Espresso', 'Milk', 'Milk foam'],
    price: 90, category: 'hot', image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=900&q=80', onSale: false,
  },
  {
    name: 'لاتيه فانيليا', nameEn: 'Vanilla Latte', description: 'إسبريسو وحليب مع نكهة الفانيليا.', descriptionEn: 'Espresso and milk with vanilla flavor.',
    ingredients: ['إسبريسو', 'حليب', 'فانيليا'], ingredientsEn: ['Espresso', 'Milk', 'Vanilla'],
    price: 105, category: 'hot', image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80', onSale: true, salePrice: 89,
  },
  {
    name: 'موكا', nameEn: 'Mocha', description: 'قهوة بالشوكولاتة والحليب.', descriptionEn: 'Coffee with chocolate and milk.',
    ingredients: ['إسبريسو', 'شوكولاتة', 'حليب'], ingredientsEn: ['Espresso', 'Chocolate', 'Milk'],
    price: 110, category: 'hot', image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80', onSale: false,
  },
  {
    name: 'هوت شوكليت', nameEn: 'Hot Chocolate', description: 'شوكولاتة ساخنة كريمية.', descriptionEn: 'Creamy hot chocolate.',
    ingredients: ['كاكاو', 'حليب', 'شوكولاتة'], ingredientsEn: ['Cocoa', 'Milk', 'Chocolate'],
    price: 95, category: 'hot', image: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=900&q=80', onSale: true, salePrice: 79,
  },
  {
    name: 'آيس لاتيه', nameEn: 'Iced Latte', description: 'إسبريسو بارد مع الحليب والثلج.', descriptionEn: 'Chilled espresso with milk and ice.',
    ingredients: ['إسبريسو', 'حليب', 'ثلج'], ingredientsEn: ['Espresso', 'Milk', 'Ice'],
    price: 100, category: 'cold', image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=80', onSale: false,
  },
  {
    name: 'آيس موكا', nameEn: 'Iced Mocha', description: 'قهوة مثلجة بالشوكولاتة.', descriptionEn: 'Iced coffee with chocolate.',
    ingredients: ['إسبريسو', 'شوكولاتة', 'حليب', 'ثلج'], ingredientsEn: ['Espresso', 'Chocolate', 'Milk', 'Ice'],
    price: 115, category: 'cold', image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80', onSale: true, salePrice: 95,
  },
  {
    name: 'ليمون نعناع', nameEn: 'Mint Lemonade', description: 'ليمون طازج مع النعناع والثلج.', descriptionEn: 'Fresh lemon with mint and ice.',
    ingredients: ['ليمون', 'نعناع', 'سكر', 'ثلج'], ingredientsEn: ['Lemon', 'Mint', 'Sugar', 'Ice'],
    price: 80, category: 'cold', image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80', onSale: false,
  },
  {
    name: 'فراولة فرابيه', nameEn: 'Strawberry Frappe', description: 'مشروب فراولة مثلج وكريمي.', descriptionEn: 'Creamy iced strawberry frappe.',
    ingredients: ['فراولة', 'حليب', 'ثلج', 'كريمة'], ingredientsEn: ['Strawberry', 'Milk', 'Ice', 'Cream'],
    price: 120, category: 'cold', image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80', onSale: true, salePrice: 99,
  },
  {
    name: 'كرواسون جبنة', nameEn: 'Cheese Croissant', description: 'كرواسون طازج محشو بالجبنة.', descriptionEn: 'Fresh croissant filled with cheese.',
    ingredients: ['كرواسون', 'جبنة'], ingredientsEn: ['Croissant', 'Cheese'],
    price: 75, category: 'food', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=80', onSale: false,
  },
  {
    name: 'ساندوتش تركي مدخن', nameEn: 'Smoked Turkey Sandwich', description: 'تركي مدخن مع جبنة وخضار وصوص.', descriptionEn: 'Smoked turkey with cheese, vegetables and sauce.',
    ingredients: ['خبز', 'تركي مدخن', 'جبنة', 'خس', 'طماطم', 'صوص'], ingredientsEn: ['Bread', 'Smoked turkey', 'Cheese', 'Lettuce', 'Tomato', 'Sauce'],
    price: 145, category: 'food', image: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=900&q=80', onSale: true, salePrice: 119,
  },
  {
    name: 'تشيز كيك', nameEn: 'Cheesecake', description: 'قطعة تشيز كيك كريمية.', descriptionEn: 'A creamy slice of cheesecake.',
    ingredients: ['جبنة كريمي', 'بسكويت', 'سكر', 'زبدة'], ingredientsEn: ['Cream cheese', 'Biscuit', 'Sugar', 'Butter'],
    price: 125, category: 'food', image: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=900&q=80', onSale: false,
  },
  {
    name: 'براوني شوكولاتة', nameEn: 'Chocolate Brownie', description: 'براوني غني بالشوكولاتة.', descriptionEn: 'Rich chocolate brownie.',
    ingredients: ['شوكولاتة', 'كاكاو', 'دقيق', 'بيض', 'زبدة'], ingredientsEn: ['Chocolate', 'Cocoa', 'Flour', 'Eggs', 'Butter'],
    price: 85, category: 'food', image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=80', onSale: true, salePrice: 69,
  },
];

exports.listProducts = async (req, res) => {
  try {
    const { branchId, search, category, sort, onSale } = req.query;
    const filter = { isAvailable: true };
    if (branchId) {
      filter.$or = [{ availableBranches: { $size: 0 } }, { availableBranches: branchId }];
    }
    if (search) {
      filter.$and = [
        ...(filter.$and || []),
        { $or: [
          { name: { $regex: search, $options: 'i' } },
          { nameEn: { $regex: search, $options: 'i' } },
        ] },
      ];
    }
    if (category) filter.category = category;
    if (onSale === 'true') filter.onSale = true;

    let query = Product.find(filter);
    if (sort === 'price_asc') query = query.sort('price');
    else if (sort === 'price_desc') query = query.sort('-price');
    else query = query.sort('-createdAt');

    const products = await query.lean();
    let subscriptionDiscountPercent = 0;
    if (
      req.user?.role === 'customer' &&
      req.user.subscriptionExpiresAt &&
      req.user.subscriptionExpiresAt > new Date()
    ) {
      const settings = await Settings.getGlobal();
      subscriptionDiscountPercent = settings.subscriptionDiscountPercent;
    }

    const result = products.map((product) => ({
      ...product,
      pricing: getProductPricing(product, subscriptionDiscountPercent),
      effectivePrice: getProductPricing(product, subscriptionDiscountPercent).effectivePrice,
      hasSubscriptionDiscount: subscriptionDiscountPercent > 0,
      subscriptionDiscountPercent,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Product deleted' });
};

exports.seedDemoProducts = async (req, res) => {
  try {
    const created = [];
    const updated = [];
    for (const demo of DEMO_PRODUCTS) {
      const existing = await Product.findOne({ name: demo.name });
      if (existing) {
        Object.assign(existing, { ...demo, availableBranches: existing.availableBranches || [] });
        await existing.save();
        updated.push(existing);
      } else {
        created.push(await Product.create({ ...demo, availableBranches: [] }));
      }
    }
    res.json({ message: 'Demo products ready', createdCount: created.length, updatedCount: updated.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
