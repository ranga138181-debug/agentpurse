import { formatCents } from "./api";
import { CategoryIcon } from "./CategoryIcon";

interface Tile {
  product_id: string;
  title: string | null;
  category: string | null;
  price_cents: number | null;
  shipping_cents: number | null;
  in_stock: boolean | null;
}

interface StorePanelProps {
  tiles: Tile[];
  pickedId?: string;
  // Present when live products are selected; the tiles are then the current mandate's results.
  terms?: string;
}

export function StorePanel({ tiles, pickedId, terms }: StorePanelProps) {
  return (
    <section aria-labelledby="store-heading" className="store">
      <h2 id="store-heading">Store</h2>
      {terms && <p className="hint">{terms}</p>}
      {terms && tiles.length === 0 && (
        <p className="hint">
          Live products for your mandate appear here after you send it.
        </p>
      )}
      <ul className="products">
        {tiles.map((product) => (
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
              {product.shipping_cents === 0
                ? "Free shipping"
                : `${formatCents(product.shipping_cents)} shipping`}
            </p>
            {product.in_stock === false && (
              <p className="stock">Out of stock</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
