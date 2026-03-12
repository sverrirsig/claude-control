import useSWR from "swr";

interface Screen {
  index: number;
  name: string;
  resolution: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useScreens() {
  const { data } = useSWR<{ screens: Screen[] }>("/api/screens", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  return data?.screens ?? [];
}
