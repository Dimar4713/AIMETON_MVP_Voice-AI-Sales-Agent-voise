import { Card, CardContent } from '@/components/ui/card';
import { RadioTower } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4 border-card-border bg-card/60 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-3 items-center">
            <RadioTower className="h-8 w-8 text-[hsl(var(--destructive))]" />
            <h1 className="text-2xl font-bold text-foreground">
              Страница не найдена
            </h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Такой страницы в пункте управления не существует.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
