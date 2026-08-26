/**
 * Curated Java algorithm and data structure templates designed for
 * the interactive 3D visualizer and execution trace runner.
 */

export type JavaTemplate = {
  id: string;
  name: string;
  category: 'Algorithms' | 'Data Structures' | 'Basics' | '3D Graphics';
  description: string;
  src: string;
};

export const JAVA_TEMPLATES: JavaTemplate[] = [
  {
    id: 'bubble-sort',
    name: 'BubbleSort3D.java',
    category: 'Algorithms',
    description: '3D animated sorting algorithm with real-time array column swaps',
    src: `public class BubbleSort3D {
    public static void main(String[] args) {
        int[] arr = { 42, 17, 89, 5, 63, 28, 71, 12, 54, 33 };
        System.out.println("Starting array:");
        printArray(arr);

        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                    System.out.println("Swapped: " + arr[j] + " <-> " + arr[j + 1]);
                }
            }
        }

        System.out.println("Sorted result:");
        printArray(arr);
    }

    static void printArray(int[] arr) {
        for (int i = 0; i < arr.length; i++) {
            System.out.print(arr[i] + " ");
        }
        System.out.println();
    }
}`,
  },
  {
    id: 'matrix-terrain',
    name: 'MatrixTerrain3D.java',
    category: '3D Graphics',
    description: '2D matrix heightmap manipulation visualized as a physical 3D terrain grid',
    src: `public class MatrixTerrain3D {
    public static void main(String[] args) {
        int rows = 6;
        int cols = 6;
        int[][] terrain = new int[rows][cols];

        System.out.println("Generating 3D Voxel Topography...");

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                int distFromCenter = Math.abs(r - 2) + Math.abs(c - 2);
                terrain[r][c] = Math.max(1, 10 - distFromCenter * 2);
                System.out.println("Elevation at [" + r + "," + c + "] = " + terrain[r][c]);
            }
        }

        System.out.println("Topography generation complete!");
    }
}`,
  },
  {
    id: 'tower-of-hanoi',
    name: 'TowerOfHanoi.java',
    category: 'Algorithms',
    description: 'Classic recursion showing dynamic 3D stack tower growth',
    src: `public class TowerOfHanoi {
    public static void main(String[] args) {
        int n = 3;
        System.out.println("Solving Tower of Hanoi for " + n + " disks:");
        solve(n, 'A', 'C', 'B');
        System.out.println("Puzzle Solved!");
    }

    static void solve(int n, char from, char to, char aux) {
        if (n == 1) {
            System.out.println("Move disk 1 from " + from + " -> " + to);
            return;
        }
        solve(n - 1, from, aux, to);
        System.out.println("Move disk " + n + " from " + from + " -> " + to);
        solve(n - 1, aux, to, from);
    }
}`,
  },
  {
    id: 'binary-search',
    name: 'BinarySearch3D.java',
    category: 'Algorithms',
    description: 'Logarithmic search with narrowing 3D pointer bounds',
    src: `public class BinarySearch3D {
    public static void main(String[] args) {
        int[] data = { 3, 8, 14, 22, 35, 48, 59, 71, 84, 96 };
        int target = 59;

        System.out.println("Searching for target: " + target);
        int index = search(data, target);

        if (index != -1) {
            System.out.println("Found " + target + " at index " + index);
        } else {
            System.out.println("Target not found");
        }
    }

    static int search(int[] arr, int target) {
        int low = 0;
        int high = arr.length - 1;

        while (low <= high) {
            int mid = (low + high) / 2;
            System.out.println("Checking mid index " + mid + " (val: " + arr[mid] + ")");

            if (arr[mid] == target) {
                return mid;
            } else if (arr[mid] < target) {
                System.out.println("Target is higher. Moving low bound.");
                low = mid + 1;
            } else {
                System.out.println("Target is lower. Moving high bound.");
                high = mid - 1;
            }
        }
        return -1;
    }
}`,
  },
  {
    id: 'binary-tree',
    name: 'BinaryTree3D.java',
    category: 'Data Structures',
    description: '3D hierarchical tree structure with dynamic node traversal and depth levels',
    src: `public class BinaryTree3D {
    static class Node {
        int val;
        Node left, right;
        Node(int v) { this.val = v; }
    }

    public static void main(String[] args) {
        Node root = new Node(50);
        root.left = new Node(30);
        root.right = new Node(70);
        root.left.left = new Node(20);
        root.left.right = new Node(40);
        root.right.left = new Node(60);
        root.right.right = new Node(80);

        System.out.println("Inorder traversal of 3D Binary Tree:");
        inorder(root);
        System.out.println("Tree traversal completed!");
    }

    static void inorder(Node root) {
        if (root != null) {
            inorder(root.left);
            System.out.println("Visited Node: " + root.val);
            inorder(root.right);
        }
    }
}`,
  },
  {
    id: 'graph-bfs',
    name: 'GraphBFS3D.java',
    category: 'Algorithms',
    description: '3D graph network node search and queue exploration',
    src: `public class GraphBFS3D {
    public static void main(String[] args) {
        int nodes = 6;
        int[][] adj = {
            {0, 1, 1, 0, 0, 0},
            {1, 0, 0, 1, 1, 0},
            {1, 0, 0, 0, 1, 1},
            {0, 1, 0, 0, 0, 1},
            {0, 1, 1, 0, 0, 1},
            {0, 0, 1, 1, 1, 0}
        };

        System.out.println("3D Graph Exploration starting from Node 0:");
        boolean[] visited = new boolean[nodes];
        visited[0] = true;
        System.out.println("Active Root Node: 0");

        for (int i = 0; i < nodes; i++) {
            if (adj[0][i] == 1 && !visited[i]) {
                visited[i] = true;
                System.out.println("Discovered neighbor node: " + i);
            }
        }
        System.out.println("BFS Wave completed in 3D space!");
    }
}`,
  },
  {
    id: 'fibonacci-memo',
    name: 'FibonacciSeries.java',
    category: 'Data Structures',
    description: 'Dynamic programming memoization array visualized in 3D',
    src: `public class FibonacciSeries {
    public static void main(String[] args) {
        int n = 12;
        int[] fib = new int[n];
        fib[0] = 0;
        fib[1] = 1;

        System.out.println("Calculating Fibonacci sequence:");
        System.out.println("fib[0] = 0");
        System.out.println("fib[1] = 1");

        for (int i = 2; i < n; i++) {
            fib[i] = fib[i - 1] + fib[i - 2];
            System.out.println("fib[" + i + "] = " + fib[i]);
        }

        System.out.println("Final 12 terms generated successfully!");
    }
}`,
  },
];
