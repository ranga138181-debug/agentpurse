import type { Product } from "@/agent/search/product";
import { formatCents } from "./api";
import { CategoryIcon } from "./CategoryIcon";

interface StorePanelProps {
  products: Product[];
  pickedId?: string;
}

export function StorePanel({ products, pickedId }: StorePanelProps) {
  return (
    <section aria-labelledby="store-heading" className="store">
      <h2 id="store-heading">Store</h2>
      <ul className="products">
        {products.map((product) => (
          <li
            key={product.product_id}
            className={product.product_id === pickedId ? "picked" : undefined}
          >
            <div className={`art ${product.category}`}>
              <CategoryIcon category={product.category} />
            </div>
            <h3>{product.title ?? "Untitled product"}</h3>
            <p>{product.category}</p>
            <p className="price">{formatCents(product.price_cents)}</p>
            <p>
              {product.shipping_cents
                ? `${formatCents(product.shipping_cents)} shipping`
                : "Free shipping"}
            </p>
            {!product.in_stock && <p className="stock">Out of stock</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
