/**
 * Curated Java algorithm and data structure templates designed for
 * the interactive 3D visualizer, memory inspector, and execution trace runner.
 */

export type JavaTemplate = {
  id: string;
  name: string;
  category: 'Algorithms' | 'Data Structures' | '3D Graphics';
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
        int totalSwaps = 0;

        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                    swapped = true;
                    totalSwaps++;
                    System.out.println("Pass " + (i + 1) + ": Swapped arr[" + j + "] (" + arr[j + 1] + ") <-> arr[" + (j + 1) + "] (" + arr[j] + ")");
                }
            }
            if (!swapped) {
                System.out.println("Array sorted early at pass " + (i + 1));
                break;
            }
        }

        System.out.println("Sorted result (Total Swaps = " + totalSwaps + "):");
        printArray(arr);
    }

    static void printArray(int[] arr) {
        for (int i = 0; i < arr.length; i++) {
            System.out.print(arr[i] + (i < arr.length - 1 ? ", " : ""));
        }
        System.out.println();
    }
}`,
  },
  {
    id: 'quick-sort',
    name: 'QuickSort3D.java',
    category: 'Algorithms',
    description: 'Recursive divide-and-conquer pivot partitioning and sub-array sorting',
    src: `public class QuickSort3D {
    public static void main(String[] args) {
        int[] arr = { 64, 34, 25, 12, 22, 11, 90, 48, 73, 5 };
        System.out.println("Initial Array for QuickSort:");
        printArray(arr);

        quickSort(arr, 0, arr.length - 1);

        System.out.println("Final QuickSorted Array:");
        printArray(arr);
    }

    static void quickSort(int[] arr, int low, int high) {
        if (low < high) {
            int pi = partition(arr, low, high);
            System.out.println("Pivot fixed at index " + pi + " (val: " + arr[pi] + ")");
            quickSort(arr, low, pi - 1);
            quickSort(arr, pi + 1, high);
        }
    }

    static int partition(int[] arr, int low, int high) {
        int pivot = arr[high];
        System.out.println("Partitioning range [" + low + ".." + high + "] with pivot " + pivot);
        int i = low - 1;

        for (int j = low; j < high; j++) {
            if (arr[j] < pivot) {
                i++;
                int temp = arr[i];
                arr[i] = arr[j];
                arr[j] = temp;
                System.out.println("  Swapped arr[" + i + "] <-> arr[" + j + "]");
            }
        }

        int temp = arr[i + 1];
        arr[i + 1] = arr[high];
        arr[high] = temp;
        System.out.println("Placed pivot " + pivot + " at index " + (i + 1));

        return i + 1;
    }

    static void printArray(int[] arr) {
        for (int i = 0; i < arr.length; i++) {
            System.out.print(arr[i] + (i < arr.length - 1 ? ", " : ""));
        }
        System.out.println();
    }
}`,
  },
  {
    id: 'binary-tree',
    name: 'BinaryTree3D.java',
    category: 'Data Structures',
    description: '3D hierarchical Binary Search Tree node insertion and traversals',
    src: `public class BinaryTree3D {
    static class Node {
        int val;
        Node left;
        Node right;

        Node(int val) {
            this.val = val;
            this.left = null;
            this.right = null;
        }
    }

    public static void main(String[] args) {
        System.out.println("Building 3D Binary Search Tree...");
        Node root = null;
        int[] values = { 50, 30, 70, 20, 40, 60, 80 };

        for (int i = 0; i < values.length; i++) {
            root = insert(root, values[i]);
            System.out.println("Inserted Node(" + values[i] + ") into 3D BST");
        }

        System.out.println("Inorder Traversal (Sorted Elements):");
        inorder(root);

        System.out.println("Tree Height = " + height(root));
        System.out.println("3D BST Construction Complete!");
    }

    static Node insert(Node root, int val) {
        if (root == null) {
            return new Node(val);
        }
        if (val < root.val) {
            root.left = insert(root.left, val);
        } else if (val > root.val) {
            root.right = insert(root.right, val);
        }
        return root;
    }

    static void inorder(Node root) {
        if (root != null) {
            inorder(root.left);
            System.out.println("Visited BST Node: " + root.val);
            inorder(root.right);
        }
    }

    static int height(Node root) {
        if (root == null) return 0;
        return 1 + Math.max(height(root.left), height(root.right));
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

        System.out.println("Generating 3D Voxel Topography Matrix (" + rows + "x" + cols + "):");

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                int distFromCenter = Math.abs(r - 2) + Math.abs(c - 2);
                int elevation = Math.max(1, 10 - distFromCenter * 2);
                terrain[r][c] = elevation;
                System.out.println("Voxel [" + r + "][" + c + "] -> Elevation " + elevation);
            }
        }

        System.out.println("Topography generation complete!");
        printMatrix(terrain, rows, cols);
    }

    static void printMatrix(int[][] matrix, int rows, int cols) {
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                System.out.printf("%3d", matrix[r][c]);
            }
            System.out.println();
        }
    }
}`,
  },
  {
    id: 'tower-of-hanoi',
    name: 'TowerOfHanoi.java',
    category: 'Algorithms',
    description: 'Classic recursive puzzle demonstrating dynamic 3D disk transfers between Pegs',
    src: `public class TowerOfHanoi {
    public static void main(String[] args) {
        int numDisks = 3;
        System.out.println("Solving Tower of Hanoi for " + numDisks + " disks:");
        System.out.println("Goal: Transfer all disks from Peg A to Peg C using Peg B");

        solve(numDisks, 'A', 'C', 'B');
        System.out.println("Puzzle Solved! Total Moves = " + ((1 << numDisks) - 1));
    }

    static void solve(int n, char fromPeg, char toPeg, char auxPeg) {
        if (n == 1) {
            System.out.println("Move Disk 1 from Peg " + fromPeg + " -> Peg " + toPeg);
            return;
        }
        solve(n - 1, fromPeg, auxPeg, toPeg);
        System.out.println("Move Disk " + n + " from Peg " + fromPeg + " -> Peg " + toPeg);
        solve(n - 1, auxPeg, toPeg, fromPeg);
    }
}`,
  },
  {
    id: 'linked-list',
    name: 'LinkedList3D.java',
    category: 'Data Structures',
    description: 'Singly linked list node chaining with next pointers and linear search',
    src: `public class LinkedList3D {
    static class ListNode {
        int val;
        ListNode next;

        ListNode(int val) {
            this.val = val;
            this.next = null;
        }
    }

    public static void main(String[] args) {
        System.out.println("Constructing Singly Linked List in 3D Space:");

        ListNode head = new ListNode(10);
        ListNode second = new ListNode(20);
        ListNode third = new ListNode(30);
        ListNode fourth = new ListNode(40);
        ListNode fifth = new ListNode(50);

        head.next = second;
        second.next = third;
        third.next = fourth;
        fourth.next = fifth;

        System.out.println("Forward List Traversal:");
        traverse(head);

        System.out.println("List Length = " + length(head));

        int target = 30;
        boolean found = search(head, target);
        System.out.println("Searching for " + target + " -> " + (found ? "FOUND" : "NOT FOUND"));
    }

    static void traverse(ListNode head) {
        ListNode curr = head;
        while (curr != null) {
            System.out.println("Visiting Node [" + curr.val + "] -> Next: " + (curr.next != null ? curr.next.val : "null"));
            curr = curr.next;
        }
    }

    static int length(ListNode head) {
        int count = 0;
        ListNode curr = head;
        while (curr != null) {
            count++;
            curr = curr.next;
        }
        return count;
    }

    static boolean search(ListNode head, int target) {
        ListNode curr = head;
        while (curr != null) {
            if (curr.val == target) return true;
            curr = curr.next;
        }
        return false;
    }
}`,
  },
  {
    id: 'graph-bfs',
    name: 'GraphBFS3D.java',
    category: 'Algorithms',
    description: '3D adjacency network exploration and breadth-first search queue wave',
    src: `public class GraphBFS3D {
    public static void main(String[] args) {
        int numNodes = 6;
        int[][] adj = {
            {0, 1, 1, 0, 0, 0},
            {1, 0, 0, 1, 1, 0},
            {1, 0, 0, 0, 1, 1},
            {0, 1, 0, 0, 0, 1},
            {0, 1, 1, 0, 0, 1},
            {0, 0, 1, 1, 1, 0}
        };

        System.out.println("3D Graph BFS Exploration starting from Node 0:");
        bfs(adj, 0, numNodes);
        System.out.println("BFS Wave completed in 3D space!");
    }

    static void bfs(int[][] adj, int startNode, int n) {
        boolean[] visited = new boolean[n];
        int[] queue = new int[n];
        int head = 0;
        int tail = 0;

        visited[startNode] = true;
        queue[tail++] = startNode;
        System.out.println("Active Root Node: " + startNode);

        while (head < tail) {
            int curr = queue[head++];
            System.out.println(">> Dequeued & Visited Node: " + curr);

            for (int neighbor = 0; neighbor < n; neighbor++) {
                if (adj[curr][neighbor] == 1 && !visited[neighbor]) {
                    visited[neighbor] = true;
                    queue[tail++] = neighbor;
                    System.out.println("   Discovered neighbor node: " + neighbor);
                }
            }
        }
    }
}`,
  },
  {
    id: 'fibonacci-memo',
    name: 'FibonacciMemo3D.java',
    category: 'Algorithms',
    description: 'Dynamic programming memoization table and recursion cache visualization',
    src: `public class FibonacciMemo3D {
    public static void main(String[] args) {
        int n = 12;
        int[] memo = new int[n + 1];

        System.out.println("Computing Fibonacci(" + n + ") with Dynamic Programming Memoization:");

        for (int i = 0; i <= n; i++) {
            memo[i] = -1;
        }

        int result = fib(n, memo);

        System.out.println("----------------------------------------");
        System.out.println("Fibonacci(" + n + ") = " + result);
        System.out.println("Memoization Table (terms 0 to " + n + "):");
        for (int i = 0; i <= n; i++) {
            System.out.println("memo[" + i + "] = " + memo[i]);
        }
    }

    static int fib(int n, int[] memo) {
        if (n <= 0) return 0;
        if (n == 1) return 1;

        if (memo[n] != -1) {
            System.out.println("Memo Cache HIT: fib(" + n + ") = " + memo[n]);
            return memo[n];
        }

        System.out.println("Computing fib(" + n + ") recursively...");
        memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
        System.out.println("Stored into Memo Table: fib(" + n + ") = " + memo[n]);
        return memo[n];
    }
}`,
  },
  {
    id: 'two-sum',
    name: 'TwoSum2D.java',
    category: 'Algorithms',
    description: 'Find two indices whose values add up to a target with pair comparison',
    src: `public class TwoSum2D {
    public static void main(String[] args) {
        int[] a = { 55, 25, 23, 35, 92, 10, 89, 22 };
        int target = 58;

        System.out.println("Finding two indices whose values add to " + target + ":");
        printArray(a);

        int[] result = findTwoSum(a, target);
        if (result != null) {
            System.out.println("FOUND PAIR: a[" + result[0] + "] (" + a[result[0]] + ") + a[" + result[1] + "] (" + a[result[1]] + ") = " + target);
        } else {
            System.out.println("No matching pair found.");
        }
    }

    static int[] findTwoSum(int[] a, int target) {
        int n = a.length;
        int comparisons = 0;

        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                comparisons++;
                int sum = a[i] + a[j];
                System.out.println("Comparison #" + comparisons + ": checking a[" + i + "] (" + a[i] + ") + a[" + j + "] (" + a[j] + ") = " + sum);

                if (sum == target) {
                    System.out.println(">> Target matched: " + a[i] + " + " + a[j] + " == " + target);
                    return new int[]{ i, j };
                }
            }
        }
        return null;
    }

    static void printArray(int[] arr) {
        for (int i = 0; i < arr.length; i++) {
            System.out.print(arr[i] + (i < arr.length - 1 ? ", " : ""));
        }
        System.out.println();
    }
}`,
  },
  {
    id: 'stack-queue',
    name: 'StackVsQueue.java',
    category: 'Data Structures',
    description: 'Side-by-side LIFO Stack vs FIFO Queue data structure comparison',
    src: `public class StackVsQueue {
    public static void main(String[] args) {
        System.out.println("STACK (LIFO) vs QUEUE (FIFO) Comparison:");

        String[] elements = { "A", "B", "C", "D" };

        System.out.println("1. Pushing elements to Stack and Queue:");
        for (int i = 0; i < elements.length; i++) {
            System.out.println("   Push / Enqueue: " + elements[i]);
        }

        System.out.println("2. Stack PEEK (LIFO - Last In First Out):");
        System.out.println("   Stack Peek Top: " + elements[3] + " (Time: O(1), Space: O(1))");

        System.out.println("3. Queue PEEK (FIFO - First In First Out):");
        System.out.println("   Queue Peek Front: " + elements[0] + " (Time: O(1), Space: O(1))");

        System.out.println("Result: Same contents. Different answer.");
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
];
