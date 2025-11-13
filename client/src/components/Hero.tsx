import { Button } from "@/components/ui/button";
import heroImage from "@assets/generated_images/Natural_ingredients_hero_background_fecc2003.png";

export default function Hero() {
  const scrollToProducts = () => {
    const productsSection = document.getElementById("products");
    productsSection?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
      
      <div className="relative z-10 container max-w-7xl mx-auto px-4 md:px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight">
            Trust Through Transparency
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto">
            We analyze every ingredient, so you don't have to. Welcome to the FirstPledge standard.
          </p>
          <div className="flex gap-4 justify-center">
            <Button
              size="lg"
              onClick={scrollToProducts}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md"
              data-testid="button-explore-products"
            >
              Explore Products
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
