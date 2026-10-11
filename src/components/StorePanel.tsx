import { listCatalog } from "@/agent/search";
import { formatCents } from "./api";

export function StorePanel() {
  return (
    <section aria-labelledby="store-heading" className="store">
      <h2 id="store-heading">Store</h2>
      <ul className="products">
        {listCatalog().map((product) => (
          <li key={product.product_id}>
            <h3>{product.title ?? "Untitled product"}</h3>
            <p>{product.category}</p>
            <p>{formatCents(product.price_cents)}</p>
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
