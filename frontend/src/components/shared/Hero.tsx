import React from 'react'; // Nhớ thêm import React

interface CardItem {
    label: string;
    value: string;
    color: string;
}

interface HeroProps {
    title: string;
    list?: CardItem[];       // 1. Thêm dấu ? để biến này không bắt buộc
    extra?: React.ReactNode; // 2. Thêm nút bấm tùy chọn ở bên phải tiêu đề
}

export default function Hero({ title, list, extra }: HeroProps) {
    const gridCols = {
        1: 'xl:grid-cols-1',
        2: 'xl:grid-cols-2',
        3: 'xl:grid-cols-3',
        4: 'xl:grid-cols-4',
        5: 'xl:grid-cols-5'
    };

    // Chỉ tính toán class nếu có list truyền vào
    const currentGridClass = list
        ? (gridCols[list.length as keyof typeof gridCols] || 'xl:grid-cols-4')
        : '';

    return (
        <div className="space-y-6">
            {/* Thanh tiêu đề có hỗ trợ nút bấm bên phải */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-brand-dark">{title}</h2>
                {extra && <div className="flex items-center gap-3">{extra}</div>}
            </div>

            {/* Chỉ render lưới KPI khi list có phần tử */}
            {list && list.length > 0 && (
                <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${currentGridClass}`}>
                    {list.map((card) => (
                        <div key={card.label} className="rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-sm text-gray-500">{card.label}</p>
                            <p className="mt-2 text-3xl font-bold" style={{ color: card.color }}>
                                {card.value}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
